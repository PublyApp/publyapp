using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class ResolveTenantProfileNamesAsStaffBody {
	public JsonElement Names { get; init; }

	private bool _parsed;
	private List<string> _names = [];

	private List<string> ParseNames() {
		if (Names.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("Names must be an array");
		}

		var names = new List<string>();
		foreach (var element in Names.EnumerateArray()) {
			var value = element.GetString();

			// Post-validation invariant: the endpoint uses FluentValidation to ensure every
			// `names[i]` is a bounded non-empty string before parsing. If this trips, it means
			// validation was bypassed or the validator/parsing logic got out of sync.
			if (value is null) {
				throw new InvalidOperationException("Every name must be a string after validation");
			}

			names.Add(value);
		}

		return names;
	}

	public List<string> GetNames() {
		if (_parsed) {
			return _names;
		}

		_names = ParseNames();
		_parsed = true;
		return _names;
	}
}

public sealed class ResolveTenantProfileNamesAsStaffBodyValidator
	: AbstractValidator<ResolveTenantProfileNamesAsStaffBody> {
	public ResolveTenantProfileNamesAsStaffBodyValidator() {
		RuleFor(x => x.Names)
			.MustBeRequiredStringArrayAllowingEmpty(
				"Names",
				"name",
				ResolveTenantProfileNamesAsStaff.MaxNames
			);
	}
}

public sealed class ResolveTenantProfileNameResolutionItem {
	public required string Name { get; init; }
	public Guid? ProfileId { get; init; }
	public string? Reason { get; init; }
}

public sealed class ResolveTenantProfileNamesAsStaffResult {
	public required List<ResolveTenantProfileNameResolutionItem> Names { get; init; }
}

/// <summary>
/// Batch-resolves tenant profile NAMES to profile ids for bulk-entry flows (#979 invite
/// drawer CSV/Excel import). Mirrors <c>ResolveTenantProfileUserAssignmentsAsStaff</c>'s
/// POST-with-body batch shape: a set of names answering a single "which profile is this"
/// read, not a list-filter predicate.
///
/// Resolution rules (authoritative here, not in any client):
/// - matches are case-insensitive over LIVE scope-1 non-deleted profiles of THIS tenant;
/// - more than one case-insensitive match reports `ambiguous` rather than picking one,
///   because ux_profiles_tenant_name is CASE-SENSITIVE and `Editor` / `editor` can both
///   exist live;
/// - zero matches reports `not-found`; the row stays editable client-side.
/// </summary>
public sealed class ResolveTenantProfileNamesAsStaff {
	// A 1000-row invite file listing a few profiles each resolves well under this cap;
	// larger batches are rejected up front instead of silently truncating.
	public const int MaxNames = 500;

	public static async Task<
		Results<
			Ok<ResolveTenantProfileNamesAsStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromBody] ResolveTenantProfileNamesAsStaffBody body,
		[FromServices] ITenantService tenantService,
		[FromServices] ITenantProfileQueryAsStaffService tenantProfileQueryService,
		ILogger<ResolveTenantProfileNamesAsStaff> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid tenant id: {@LogData}",
					new { TenantId = tenantId }
				);
			}

			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(
			tenantIdGuid,
			cancellationToken
		);
		if (tenant is null) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		var serviceResult = await tenantProfileQueryService.ResolveTenantProfileNamesAsync(
			new ResolveTenantProfileNamesArgs(
				TenantId: tenantIdGuid,
				Names: body.GetNames()
			),
			cancellationToken
		);

		if (serviceResult is Services.ResolveTenantProfileNamesResult.TenantNotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		if (serviceResult
			is Services.ResolveTenantProfileNamesResult.Success success) {
			return TypedResults.Ok(new ResolveTenantProfileNamesAsStaffResult {
				Names = success.Resolutions
					.Select(resolution => new ResolveTenantProfileNameResolutionItem {
						Name = resolution.Name,
						ProfileId = resolution.ProfileId,
						Reason = resolution.Reason,
					})
					.ToList(),
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
