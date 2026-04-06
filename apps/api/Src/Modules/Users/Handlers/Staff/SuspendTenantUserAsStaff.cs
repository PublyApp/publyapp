using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

/// <summary>
/// Result for suspending a tenant user.
/// </summary>
public record SuspendTenantUserResultDto {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
	public string? AvatarUrl { get; set; }
	public string Level { get; set; } = string.Empty;
	public string Status { get; set; } = string.Empty;
	public bool IsSuspended { get; set; }
	public Guid? TenantId { get; set; }
}

/// <summary>
/// Suspend a tenant user (marks the UserAccount as suspended).
/// </summary>
public class SuspendTenantUserAsStaff {
	public static async Task<Results<
		Ok<SuspendTenantUserResultDto>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> HandleSuspendTenantUserAsStaff(
		[FromRoute] string tenantId,
		[FromRoute] string userId,
		[FromServices] IUserService userService,
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

		var result = await userService.SuspendTenantUserAsync(
			tenantIdGuid,
			userIdGuid,
			cancellationToken
		);

		if (result is SuspendTenantUserResult.NotFound) {
			return TypedProblems.NotFound(
				"User not found in tenant",
				ResponseKeys.NotFound
			);
		}

		if (result is SuspendTenantUserResult.AlreadySuspended) {
			return TypedProblems.Conflict(
				"User is already suspended",
				ResponseKeys.UserSuspended
			);
		}

		if (result is SuspendTenantUserResult.CannotSuspendLastAdmin) {
			return TypedProblems.BadRequest(
				"Cannot suspend the last admin from the tenant",
				ResponseKeys.CannotSuspendLastAdmin
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		if (result is not SuspendTenantUserResult.Success success) {
			throw new InvalidOperationException(
				$"Unknown suspend tenant user result: {result.GetType().Name}"
			);
		}

		var userData = success.UserData;

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.TenantUserSuspended,
			userIdGuid,
			new {
				TenantId = tenantIdGuid,
				UserId = userIdGuid,
				SuspendedByUserId = account.UserId,
				UserEmail = userData.User.Email,
				UserFullName = $"{userData.User.FirstName} {userData.User.LastName}".Trim()
			},
			cancellationToken
		);

		return TypedResults.Ok(new SuspendTenantUserResultDto {
			Id = userData.User.GetRequiredId(),
			Email = userData.User.Email,
			FirstName = userData.User.FirstName,
			LastName = userData.User.LastName,
			AvatarUrl = userData.User.AvatarUrl,
			Level = UserAccount.GetLevelDescription(userData.AccountLevel),
			Status = UserAccount.GetStatusDescription(
				UserAccount.GetTenantStatus(
					userData.User.IsSuspended,
					userData.Account.IsSuspended
				)
			),
			IsSuspended = userData.Account.IsSuspended,
			TenantId = userData.Account.TenantId,
		});
	}
}
