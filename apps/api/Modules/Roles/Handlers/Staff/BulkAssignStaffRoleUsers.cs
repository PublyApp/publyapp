using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Roles.Services;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class BulkAssignStaffRoleUsersBody {
	[Required]
	public JsonElement UserIds { get; init; }

	// Non-throwing per-element parse: a malformed element surfaces as a 422 that
	// names the offending value, never a 500 (same contract as the unassign route).
	public bool TryGetUserIds(out List<Guid> userIds, out List<string> invalidValues) {
		userIds = [];
		invalidValues = [];

		if (this.UserIds.ValueKind != JsonValueKind.Array) {
			invalidValues.Add(this.UserIds.GetRawText());
			return false;
		}

		foreach (var userIdElement in this.UserIds.EnumerateArray()) {
			var raw = userIdElement.ValueKind == JsonValueKind.String
				? userIdElement.GetString()
				: null;

			if (raw is not null && Guid.TryParse(raw, out var userId)) {
				userIds.Add(userId);
				continue;
			}

			invalidValues.Add(raw ?? userIdElement.GetRawText());
		}

		return invalidValues.Count == 0;
	}
}

public sealed class BulkAssignStaffRoleUsersBodyValidator
	: AbstractValidator<BulkAssignStaffRoleUsersBody> {
	public BulkAssignStaffRoleUsersBodyValidator() {
		this.RuleFor(x => x.UserIds)
			.MustBeRequiredGuidArray(
				fieldName: "userIds",
				itemName: "userId",
				// Must stay in sync with shared BULK_ACTION_MAX_COUNT
				// (packages/shared-ts/src/lib/constants.ts) used by frontend selection UIs.
				maxCount: 100,
				nameInvalidItems: true
			);
	}
}

public sealed class BulkAssignStaffRoleUsers {
	public static async Task<
		Results<
			Ok<BulkStaffRoleUserAssignActionResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppForbiddenHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string roleId,
		[FromBody] BulkAssignStaffRoleUsersBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IRoleAssignmentGuard roleAssignmentGuard,
		[FromServices] IStaffRoleUserAssignmentAsStaffService staffRoleUserAssignmentAsStaffService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<BulkAssignStaffRoleUsers> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			return TypedProblems.BadRequest("Invalid roleId", ResponseKeys.MalformedId);
		}

		var actor = authContext.GetRequiredStaffAccount();

		if (!body.TryGetUserIds(out var parsedUserIds, out var invalidUserIds)) {
			// Defense in depth behind the shared validator.
			var errors = invalidUserIds.ToDictionary(
				value => "userIds",
				value => new[] { $"userIds contains '{value}', which is not a valid user id" }
			);

			return TypedProblems.ValidationProblem(
				"One or more userIds are malformed",
				ResponseKeys.RequestBodyValidationFailed,
				errors
			);
		}

		// A route permission alone must not let a non-full-access actor hand out the
		// full-access role (self-grant of every permission).
		if (!await roleAssignmentGuard.CanAssignRolesAsync(
			actor.UserId,
			[roleIdGuid],
			cancellationToken
		)) {
			return TypedProblems.Forbidden(
				"Only a full-access staff member can assign the full-access role",
				ResponseKeys.Forbidden
			);
		}

		// Collapse duplicates up front so the bulk action stays idempotent.
		var requestedUserIds = parsedUserIds.Distinct().ToList();

		var result = await staffRoleUserAssignmentAsStaffService.AssignStaffRoleUsersAsync(
			new AssignStaffRoleUsersArgs(RoleId: roleIdGuid, UserIds: requestedUserIds),
			cancellationToken
		);

		if (result is AssignStaffRoleUsersServiceResult.RoleNotFound) {
			return TypedProblems.NotFound("Role not found", ResponseKeys.NotFound);
		}

		if (result is not AssignStaffRoleUsersServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled AssignStaffRoleUsersServiceResult type: "
				+ result.GetType().Name
			);
		}

		// One audit row per member who actually gained the role; skipped ids are
		// already reported in the response and must not pollute the audit trail.
		try {
			await auditLogService.LogManyAsync(
				success.AssignedUserIds
					.Select(userId => new CreateAuditLogArgs(
						UserId: actor.UserId,
						Action: AuditActions.StaffRoleUserAssigned,
						TargetId: userId,
						Details: new { roleId = roleIdGuid }
					))
					.ToList(),
				cancellationToken
			);
		} catch (Exception ex) {
			// Audit logging is observability: don't fail the bulk response over it.
			logger.LogError(
				ex,
				"Failed to write audit logs for bulk staff role user assign; {Count} entries lost.",
				success.Result.SucceededCount
			);
		}

		return TypedResults.Ok(success.Result);
	}
}
