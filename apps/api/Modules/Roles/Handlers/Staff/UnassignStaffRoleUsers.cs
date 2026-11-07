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

public sealed class UnassignStaffRoleUsersBody {
	[Required]
	public JsonElement UserIds { get; init; }

	// Non-throwing per-element parse (#1413 round-2 hardening): a malformed
	// element must surface as a 422 that NAMES the offending value in plain
	// words — never the 500 that GetValueAsGuid's InvalidOperationException
	// would produce. The shared validator names invalid elements via its
	// nameInvalidItems opt-in; empty/>max stay owned by MustBeRequiredGuidArray.
	// This parse remains defense in depth for rule reordering.
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

public sealed class UnassignStaffRoleUsersBodyValidator
	: AbstractValidator<UnassignStaffRoleUsersBody> {
	public UnassignStaffRoleUsersBodyValidator() {
		this.RuleFor(x => x.UserIds)
			.MustBeRequiredGuidArray(
				fieldName: "userIds",
				itemName: "userId",
				// Must stay in sync with shared BULK_ACTION_MAX_COUNT
				// (packages/shared-ts/src/lib/constants.ts) used by frontend selection UIs.
				maxCount: 100,
				// Name the offending value per malformed element (transparent
				// failure cause) instead of one blanket "every userId" message.
				nameInvalidItems: true
			);
	}
}

public sealed class UnassignStaffRoleUsers {
	public static async Task<
		Results<
			Ok<BulkStaffRoleUserUnassignActionResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string roleId,
		[FromBody] UnassignStaffRoleUsersBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IStaffRoleUserAssignmentAsStaffService staffRoleUserAssignmentAsStaffService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<UnassignStaffRoleUsers> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			return TypedProblems.BadRequest("Invalid roleId", ResponseKeys.MalformedId);
		}

		var account = authContext.GetRequiredStaffAccount();

		// Collapse duplicates up front so bulk actions stay idempotent and the
		// service does not waste work on repeated user IDs from the UI selection
		// model.
		if (!body.TryGetUserIds(out var parsedUserIds, out var invalidUserIds)) {
			// Defense in depth: the shared validator 422s non-GUID elements while
			// naming each offending value; if that rule is ever loosened or
			// reordered, this branch keeps the contract honest — 422 naming each
			// offending value, never an unhandled-parse 500.
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

		var requestedUserIds = parsedUserIds.Distinct().ToList();

		var result = await staffRoleUserAssignmentAsStaffService.UnassignStaffRoleUsersAsync(
			new UnassignStaffRoleUsersArgs(RoleId: roleIdGuid, UserIds: requestedUserIds),
			cancellationToken
		);

		if (result is UnassignStaffRoleUsersServiceResult.RoleNotFound) {
			return TypedProblems.NotFound("Role not found", ResponseKeys.NotFound);
		}

		if (result is not UnassignStaffRoleUsersServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled UnassignStaffRoleUsersServiceResult type: "
				+ result.GetType().Name
			);
		}

		// One audit row per successfully unassigned user; skipped ids are already
		// reported in the response and must not pollute the audit trail.
		try {
			await auditLogService.LogManyAsync(
				requestedUserIds
					.Except(success.Result.FailedItems.Select(item => item.UserId))
					.Select(userId => new CreateAuditLogArgs(
						UserId: account.UserId,
						Action: AuditActions.StaffRoleUserUnassigned,
						TargetId: userId
					))
					.ToList(),
				cancellationToken
			);
		} catch (Exception ex) {
			// Audit logging is observability — don't fail the bulk response over it.
			// Log centrally and let the user see their bulk action succeed.
			logger.LogError(
				ex,
				"Failed to write audit logs for bulk staff role user unassign; {Count} entries lost.",
				success.Result.SucceededCount
			);
		}

		return TypedResults.Ok(success.Result);
	}
}
