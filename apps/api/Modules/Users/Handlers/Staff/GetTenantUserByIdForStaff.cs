using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class TenantUserDetailsForStaffResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
	public string? AvatarUrl { get; set; }
	public UserStatus Status { get; set; }
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
	public int CompanyCount { get; set; }
}

public static class TenantUserDetailsForStaffMapper {
	public static TenantUserDetailsForStaffResult Map(
		TenantUserDetailsData userData
	) {
		return new TenantUserDetailsForStaffResult {
			// This is the shared identity id used by /staff/tenant-users/{userId};
			// tenant membership ids stay internal to company-level actions.
			Id = userData.User.GetRequiredId(),
			Email = userData.User.Email,
			FirstName = userData.User.FirstName,
			LastName = userData.User.LastName,
			AvatarUrl = userData.User.AvatarUrl,
			Status = userData.User.Status,
			CreatedAt = userData.User.CreatedAt,
			UpdatedAt = userData.User.UpdatedAt,
			CompanyCount = userData.CompanyCount,
		};
	}
}

public sealed class GetTenantUserByIdForStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsForStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string userId,
		[FromServices] ITenantUserQueryService userService,
		[FromServices] ILogger<GetTenantUserByIdForStaff> logger,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var userData = await userService.GetTenantUserDetailsForStaffAsync(
			userIdGuid,
			cancellationToken
		);

		if (userData is null) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Tenant user not found: {@LogData}",
					new { UserId = userIdGuid }
				);
			}

			return TypedProblems.NotFound(
				"Tenant user not found",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(
			TenantUserDetailsForStaffMapper.Map(userData)
		);
	}
}
