using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Account.Services;

namespace PublyApp.Api.Modules.Account.Handlers.Tenant;

public class AccountProfileResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? AvatarUrl { get; set; }
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
}

public sealed class GetAccountProfileForTenant {
	public static async Task<Results<
		Ok<AccountProfileResult>,
		AppNotFoundHttpResult,
		AppInternalServerErrorHttpResult
	>> Handle(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IAccountProfileService accountProfileService,
		[FromServices] ILogger<GetAccountProfileForTenant> logger,
		CancellationToken cancellationToken
	) {
		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException(
				$"{nameof(authContext.UserId)} is not a GUID"
			);
		}

		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var profile = await accountProfileService.GetAccountProfileAsync(
			userId,
			tenantId,
			cancellationToken
		);

		if (profile is null) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Tenant account not found: {@LogData}",
					new { UserId = userId, TenantId = tenantId }
				);
			}

			return TypedProblems.NotFound(
				"Tenant account not found",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(ToResult(profile));
	}

	private static AccountProfileResult ToResult(AccountProfileData profile) {
		return new AccountProfileResult {
			Id = profile.Id,
			Email = profile.Email,
			FirstName = profile.FirstName,
			LastName = profile.LastName,
			AvatarUrl = profile.AvatarUrl,
		};
	}
}
