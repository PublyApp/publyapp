using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class UnassignStaffProfileUsersBody {
	[Required]
	public JsonElement UserIds { get; init; }

	public List<Guid> GetUserIds() {
		var userIds = new List<Guid>();

		foreach (var userIdElement in UserIds.EnumerateArray()) {
			userIds.Add(userIdElement.GetValueAsGuid());
		}

		return userIds;
	}
}

public sealed class UnassignStaffProfileUsersBodyValidator
	: AbstractValidator<UnassignStaffProfileUsersBody> {
	public UnassignStaffProfileUsersBodyValidator() {
		RuleFor(x => x.UserIds)
			.MustBeRequiredGuidArray(
				fieldName: "userIds",
				itemName: "userId",
				// Must stay in sync with shared BULK_ACTION_MAX_COUNT
				// (packages/shared-ts/src/lib/constants.ts) used by frontend selection UIs.
				maxCount: 100
			);
	}
}

public sealed class UnassignStaffProfileUsers {
	public static async Task<
		Results<
			Ok<BulkStaffProfileUserUnassignActionResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult,
			AppValidationProblemHttpResult
		>
	> Handle(
		[FromRoute] string profileId,
		[FromBody] UnassignStaffProfileUsersBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IStaffProfileUserAssignmentAsStaffService staffProfileUserAssignmentAsStaffService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<UnassignStaffProfileUsers> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest("Invalid profileId", ResponseKeys.MalformedId);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		// Collapse duplicates up front so bulk actions stay idempotent and the service
		// does not waste work on repeated user IDs from the UI selection model.
		var requestedUserIds = body.GetUserIds().Distinct().ToList();

		var result = await staffProfileUserAssignmentAsStaffService.UnassignStaffProfileUsersAsync(
			new UnassignStaffProfileUsersArgs(ProfileId: profileIdGuid, UserIds: requestedUserIds),
			cancellationToken
		);

		if (result is UnassignStaffProfileUsersServiceResult.ProfileNotFound) {
			return TypedProblems.NotFound("Profile not found", ResponseKeys.NotFound);
		}

		if (result is not UnassignStaffProfileUsersServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled UnassignStaffProfileUsersServiceResult type: "
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
						Action: AuditActions.StaffProfileUserUnassigned,
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
				"Failed to write audit logs for bulk staff profile user unassign; {Count} entries lost.",
				success.Result.SucceededCount
			);
		}

		return TypedResults.Ok(success.Result);
	}
}
