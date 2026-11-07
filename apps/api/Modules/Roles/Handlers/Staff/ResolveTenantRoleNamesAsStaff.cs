using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Tenants.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class ResolveTenantRoleNamesAsStaffBody {
	public JsonElement Names { get; init; }

	private bool _Parsed;
	private List<string> _Names = [];

	private List<string> _ParseNames() {
		if (this.Names.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("Names must be an array");
		}

		var names = new List<string>();
		foreach (var element in this.Names.EnumerateArray()) {
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
		if (this._Parsed) {
			return this._Names;
		}

		this._Names = this._ParseNames();
		this._Parsed = true;
		return this._Names;
	}
}

public sealed class ResolveTenantRoleNamesAsStaffBodyValidator
	: AbstractValidator<ResolveTenantRoleNamesAsStaffBody> {
	public ResolveTenantRoleNamesAsStaffBodyValidator() {
		this.RuleFor(x => x.Names)
			.MustBeRequiredStringArrayAllowingEmpty(
				"Names",
				"name",
				ResolveTenantRoleNamesAsStaff.MaxNames
			);
	}
}

public sealed class ResolveTenantRoleNameResolutionItem {
	public required string Name { get; init; }
	public Guid? RoleId { get; init; }
	public string? Reason { get; init; }
}

public sealed class ResolveTenantRoleNamesAsStaffResult {
	public required List<ResolveTenantRoleNameResolutionItem> Names { get; init; }
}

/// <summary>
/// Batch-resolves tenant role NAMES to role ids for bulk-entry flows (#979 invite
/// drawer CSV/Excel import). Mirrors <c>ResolveTenantRoleUserAssignmentsAsStaff</c>'s
/// POST-with-body batch shape: a set of names answering a single "which role is this"
/// read, not a list-filter predicate.
///
/// Resolution rules (authoritative here, not in any client):
/// - matches are case-insensitive over LIVE scope-1 non-deleted roles of THIS tenant;
/// - more than one case-insensitive match reports `ambiguous` rather than picking one,
///   because ux_roles_tenant_name is CASE-SENSITIVE and `Editor` / `editor` can both
///   exist live;
/// - zero matches reports `not-found`; the row stays editable client-side.
/// </summary>
public sealed class ResolveTenantRoleNamesAsStaff {
	// A 1000-row invite file listing a few roles each resolves well under this cap;
	// larger batches are rejected up front instead of silently truncating.
	public const int MaxNames = 500;

	public static async Task<
		Results<
			Ok<ResolveTenantRoleNamesAsStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromBody] ResolveTenantRoleNamesAsStaffBody body,
		[FromServices] ITenantService tenantService,
		[FromServices] ITenantRoleQueryAsStaffService tenantRoleQueryService,
		ILogger<ResolveTenantRoleNamesAsStaff> logger,
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

		var serviceResult = await tenantRoleQueryService.ResolveTenantRoleNamesAsync(
			new ResolveTenantRoleNamesArgs(
				TenantId: tenantIdGuid,
				Names: body.GetNames()
			),
			cancellationToken
		);

		if (serviceResult is Services.ResolveTenantRoleNamesResult.TenantNotFound) {
			return TypedProblems.NotFound(
				"Tenant not found",
				ResponseKeys.TenantNotFound
			);
		}

		if (serviceResult
			is Services.ResolveTenantRoleNamesResult.Success success) {
			return TypedResults.Ok(new ResolveTenantRoleNamesAsStaffResult {
				Names = success.Resolutions
					.Select(resolution => new ResolveTenantRoleNameResolutionItem {
						Name = resolution.Name,
						RoleId = resolution.RoleId,
						Reason = resolution.Reason,
					})
					.ToList(),
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
