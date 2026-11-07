using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class ResolveTenantRoleUserAssignmentsAsStaffBody {
	public JsonElement UserAccountIds { get; init; }

	private bool _Parsed;
	private List<Guid> _UserAccountIds = [];

	private List<Guid> _ParseUserAccountIds() {
		if (this.UserAccountIds.ValueKind != JsonValueKind.Array) {
			throw new InvalidOperationException("UserAccountIds must be an array");
		}

		var ids = new List<Guid>();
		foreach (var e in this.UserAccountIds.EnumerateArray()) {
			var str = e.GetString();
			if (str is null) {
				// Post-validation invariant: the endpoint uses FluentValidation to ensure every
				// `userAccountIds[i]` is a non-empty UUID string before parsing. If this trips,
				// it means validation was bypassed or the validator/parsing logic got out of sync.
				throw new InvalidOperationException("UserAccountId is null after validation");
			}

			ids.Add(Guid.Parse(str));
		}

		return ids;
	}

	public List<Guid> GetUserAccountIds() {
		if (this._Parsed) {
			return this._UserAccountIds;
		}

		this._UserAccountIds = this._ParseUserAccountIds();
		this._Parsed = true;
		return this._UserAccountIds;
	}
}

public sealed class ResolveTenantRoleUserAssignmentsAsStaffBodyValidator
	: AbstractValidator<ResolveTenantRoleUserAssignmentsAsStaffBody> {
	private const int _MaxUserAccountIds = 200;

	public ResolveTenantRoleUserAssignmentsAsStaffBodyValidator() {
		this.RuleFor(x => x.UserAccountIds)
			.MustBeRequiredGuidArrayAllowingEmpty(
				"UserAccountIds",
				"userAccountId",
				ResolveTenantRoleUserAssignmentsAsStaffBodyValidator._MaxUserAccountIds
			);
	}
}

public sealed class ResolveTenantRoleUserAssignmentsAsStaffItem {
	public required Guid UserAccountId { get; init; }
	public required bool IsAssigned { get; init; }
}

public sealed class ResolveTenantRoleUserAssignmentsAsStaffResult {
	public required List<ResolveTenantRoleUserAssignmentsAsStaffItem> Assignments { get; init; }
}

/// <summary>
/// Batch-resolves whether a set of tenant member accounts is assigned to a tenant role.
/// Mirrors <c>ResolveStaffRoleUserAssignments</c> (the staff-roles precedent) — POST with
/// a JSON body array, not a CSV query filter: the request is a set of ids answering a single
/// "is assigned" read, not a list-filter predicate, so the repo's CSV-query-filter convention
/// (for <c>[AsParameters]</c> GET query DTOs) does not apply here, exactly as it does not for
/// the staff-roles precedent this mirrors. Keyed by <c>user_account_id</c> to match the
/// sibling assign/unassign endpoints on this route group.
/// </summary>
public sealed class ResolveTenantRoleUserAssignmentsAsStaff {
	public static async Task<
		Results<
			Ok<ResolveTenantRoleUserAssignmentsAsStaffResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string roleId,
		[FromBody] ResolveTenantRoleUserAssignmentsAsStaffBody body,
		[FromServices] ITenantRoleQueryAsStaffService tenantRoleQueryService,
		ILogger<ResolveTenantRoleUserAssignmentsAsStaff> logger,
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

		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid role id: {@LogData}",
					new { RoleId = roleId }
				);
			}

			return TypedProblems.BadRequest(
				"Invalid roleId",
				ResponseKeys.MalformedId
			);
		}

		var args = new ResolveTenantRoleUserAssignmentsArgs(
			TenantId: tenantIdGuid,
			RoleId: roleIdGuid,
			UserAccountIds: body.GetUserAccountIds()
		);

		var serviceResult = await tenantRoleQueryService
			.ResolveTenantRoleUserAssignmentsAsync(
				args,
				cancellationToken
			);

		if (serviceResult is ResolveTenantRoleUserAssignmentsResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (
			serviceResult
				is not ResolveTenantRoleUserAssignmentsResult.Success success
		) {
			throw new InvalidOperationException(
				"Unhandled ResolveTenantRoleUserAssignmentsResult type: "
				+ serviceResult.GetType().Name
			);
		}

		return TypedResults.Ok(new ResolveTenantRoleUserAssignmentsAsStaffResult {
			Assignments = success.Assignments
				.Select(a => new ResolveTenantRoleUserAssignmentsAsStaffItem {
					UserAccountId = a.UserAccountId,
					IsAssigned = a.IsAssigned,
				})
				.ToList(),
		});
	}
}
