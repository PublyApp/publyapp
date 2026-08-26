using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class GetTenantUserAsStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string userId,
		[FromServices] ITenantUserQueryService userService,
		[FromServices] ILogger<GetTenantUserAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var userData = await userService.GetTenantUserByIdAsync(
			tenantIdGuid,
			userIdGuid,
			cancellationToken
		);

		if (userData is null) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Tenant user membership not found: {@LogData}",
					new { TenantId = tenantIdGuid, UserId = userIdGuid }
				);
			}

			return TypedProblems.NotFound(
				"User not found in tenant",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(new TenantUserDetailsResult {
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
			CreatedAt = userData.User.CreatedAt,
			UpdatedAt = userData.User.UpdatedAt,
		});
	}
}
