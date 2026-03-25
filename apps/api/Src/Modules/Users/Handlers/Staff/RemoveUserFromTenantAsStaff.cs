using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class RemoveUserFromTenantAsStaff {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleRemoveUserFromTenantAsStaff(
		[FromRoute] string tenantId,
		[FromRoute] string userId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IUserService userService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] ILogger<RemoveUserFromTenantAsStaff> logger,
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

		var result = await userService.RemoveUserFromTenantAsync(
			tenantIdGuid,
			userIdGuid,
			cancellationToken
		);

		if (result is RemoveUserFromTenantResult.Success) {
			if (logger.IsEnabled(LogLevel.Information)) {
				logger.LogInformation(
					"User {UserId} removed from tenant {TenantId}",
					userIdGuid,
					tenantIdGuid
				);
			}

			var account = authContext.AccountStaff;
			if (account is null) {
				throw new InvalidOperationException(
					"Staff account not found in auth context. "
					+ "Ensure the endpoint has "
					+ ".WithPermission() middleware."
				);
			}

			await auditLogService.LogAsync(
				account.UserId,
				AuditActions.TenantUserRemoved,
				userIdGuid,
				new {
					TenantId = tenantIdGuid,
					TenantUserId = userIdGuid,
					RemovedByUserId = account.UserId
				},
				cancellationToken
			);

			return TypedResults.Ok(
				ApiResponse.Create(
					"User removed successfully",
					ResponseKeys.UserRemovedSuccess
				)
			);
		}

		if (result is RemoveUserFromTenantResult.NotFound) {
			return TypedProblems.NotFound(
				"User not found in tenant",
				ResponseKeys.NotFound
			);
		}

		if (result is RemoveUserFromTenantResult.CannotRemoveLastAdmin) {
			return TypedProblems.BadRequest(
				"Cannot remove the last admin from the tenant",
				ResponseKeys.CannotRemoveLastAdmin
			);
		}

		return TypedProblems.BadRequest(
			"Failed to remove user",
			ResponseKeys.BadRequest
		);
	}
}
