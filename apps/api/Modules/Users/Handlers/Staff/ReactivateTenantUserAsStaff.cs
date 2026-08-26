using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

using UserServices = PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

/// <summary>
/// HTTP wire result for the reactivate tenant-user operation; top-level sibling per the
/// handler file contract, with no Dto suffix on wire types.
/// </summary>
public record ReactivateTenantUserResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
	public string? AvatarUrl { get; set; }
	public AccountLevel Level { get; set; }
	public TenantUserStatus Status { get; set; }
	public Guid? TenantId { get; set; }
}

/// <summary>
/// Reactivate a suspended tenant user (marks the UserAccount as not suspended).
/// </summary>
public sealed class ReactivateTenantUserAsStaff {
	public static async Task<Results<
		Ok<ReactivateTenantUserResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string userId,
		[FromServices] ITenantUserMembershipService tenantUserMembershipService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		CancellationToken cancellationToken = default
	) {
		// Validate tenantId
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		// Validate userId
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var result = await tenantUserMembershipService.ReactivateTenantUserAsync(
			tenantIdGuid,
			userIdGuid,
			cancellationToken
		);

		if (result is UserServices.ReactivateTenantUserResult.NotFound) {
			return TypedProblems.NotFound(
				"User not found in tenant",
				ResponseKeys.NotFound
			);
		}

		if (result is UserServices.ReactivateTenantUserResult.NotSuspended) {
			return TypedProblems.Conflict(
				"User is not currently suspended",
				ResponseKeys.UserNotSuspended
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		if (result is not UserServices.ReactivateTenantUserResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown reactivate tenant user result: {result.GetType().Name}"
			);
		}

		var userData = success.UserData;

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantUserReactivated,
				TargetId: userIdGuid,
				Details: new {
					TenantId = tenantIdGuid,
					UserId = userIdGuid,
					ReactivatedByUserId = account.UserId,
					UserEmail = userData.User.Email,
					UserFullName = $"{userData.User.FirstName} {userData.User.LastName}".Trim()
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new ReactivateTenantUserResult {
			Id = userData.User.GetRequiredId(),
			Email = userData.User.Email,
			FirstName = userData.User.FirstName,
			LastName = userData.User.LastName,
			AvatarUrl = userData.User.AvatarUrl,
			Level = userData.AccountLevel,
			Status = UserAccount.GetTenantStatus(
				userData.User.Status,
				userData.Account.Status
			),
			TenantId = userData.Account.TenantId,
		});
	}
}
