using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class TenantUserDetailsForStaffResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
	public string? AvatarUrl { get; set; }
	public string Status { get; set; } = string.Empty;
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
	public List<TenantUserCompanyForStaffResult> Companies { get; set; } = [];
}

public class TenantUserCompanyForStaffResult {
	public Guid TenantId { get; set; }
	public string TenantName { get; set; } = string.Empty;
	public string? TenantLogoUrl { get; set; }
	public string Level { get; set; } = string.Empty;
	public string Status { get; set; } = string.Empty;
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
}

public static class TenantUserDetailsForStaffMapper {
	public static TenantUserDetailsForStaffResult Map(
		TenantUserDetailsData userData
	) {
		return new TenantUserDetailsForStaffResult {
			Id = userData.User.GetRequiredId(),
			Email = userData.User.Email,
			FirstName = userData.User.FirstName,
			LastName = userData.User.LastName,
			AvatarUrl = userData.User.AvatarUrl,
			Status = User.GetStatusDescription(userData.User.Status),
			CreatedAt = userData.User.CreatedAt,
			UpdatedAt = userData.User.UpdatedAt,
			Companies = userData.Companies
				.Select(company => new TenantUserCompanyForStaffResult {
					TenantId = company.Tenant.GetRequiredId(),
					TenantName = company.Tenant.Name,
					TenantLogoUrl = company.Tenant.LogoUrl,
					Level = UserAccount.GetLevelDescription(
						company.AccountLevel
					),
					Status = UserAccount.GetStatusDescription(
						UserAccount.GetTenantStatus(
							userData.User.Status,
							company.Account.Status
						)
					),
					CreatedAt = company.Account.CreatedAt,
					UpdatedAt = company.Account.UpdatedAt,
				})
				.ToList(),
		};
	}
}

public class GetTenantUserByIdForStaff {
	public static async Task<Results<
		Ok<TenantUserDetailsForStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleGetTenantUserByIdForStaff(
		[FromRoute] string userId,
		[FromServices] IUserService userService,
		[FromServices] ILogger<GetTenantUserByIdForStaff> logger,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid userId",
				ResponseKeys.MalformedId
			);
		}

		var userData = await userService.GetTenantUserDetailsAsync(
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
