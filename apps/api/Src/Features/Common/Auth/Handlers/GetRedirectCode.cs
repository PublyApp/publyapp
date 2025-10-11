using FluentValidation;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Middlewares;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Common.Auth.Handlers;

public class GetRedirectCodeQuery {
	public string? TenantId { get; set; }

	public Guid GetTenantId() {
		return Guid.TryParse(TenantId, out var tenantId) ? tenantId : Guid.Empty;
	}
}

public class GetRedirectCodeQueryValidator : AbstractValidator<GetRedirectCodeQuery> {
	public GetRedirectCodeQueryValidator() {
		// TenantId is optional, so no validation rules needed
	}
}

public class GetRedirectCodeResult {
	public string RedirectCode { get; set; } = string.Empty;
}

public class GetRedirectCode {
	public static async Task<
		Results<
			Ok<GetRedirectCodeResult>,
			BadRequest<ApiResponse>
		>
	> HandleGetRedirectCode(
		[AsParameters] GetRedirectCodeQuery query,
		IAuthContext authContext,
		ILogger<GetRedirectCode> logger,
		[FromServices] IAccountService accountService,
		[FromServices] ITenantService tenantService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			logger.LogError("{@GetRedirectCode}", new {
				UserId = authContext.UserId,
				SessionToken = authContext.SessionToken
			});
			throw new Exception($"{nameof(GetRedirectCode)} must be set behind {nameof(SessionAuthMiddleware)}.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new Exception($"{nameof(authContext.UserId)} is not a GUID");
		}

		var tenantId = query.GetTenantId();

		// Check if user is a staff member
		var isUserStaffMember = await accountService.IsUserStaffMemberAsync(userId, cancellationToken);

		if (isUserStaffMember) {
			if (tenantId != Guid.Empty) {
				var tenant = await tenantService.GetTenantAsync(tenantId, cancellationToken);

				if (tenant != null) {
					return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = tenant.GetRequiredId().ToString() });
				}
			}

			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "staff" });
		}

		// User is not a staff member, check tenant access
		if (tenantId != Guid.Empty) {
			var tenant = await tenantService.GetTenantAsync(tenantId, cancellationToken);

			if (tenant != null) {
				var isMember = await accountService.IsUserMemberOfTenantAsync(userId, tenantId, cancellationToken);

				if (isMember) {
					return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = tenant.GetRequiredId().ToString() });
				}

				logger.LogWarning(
					"Attempt to access tenant {TenantId} by user {UserId} who is not a member of said tenant",
					tenantId,
					userId
				);
				return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
			}
		}

		// Get fallback tenant (first tenant the user is a member of)
		var userTenantAccounts = await accountService.FindUserTenantAccountsAsync(userId, limit: 1, cancellationToken: cancellationToken);
		var fallbackTenant = userTenantAccounts.FirstOrDefault();

		if (fallbackTenant?.TenantId != null) {
			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = fallbackTenant.TenantId.Value.ToString() });
		}

		logger.LogWarning(
			"Attempt to access nonexisting tenant {TenantId} by user {UserId} but user had no fallback tenant",
			query.TenantId,
			userId
		);
		return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
	}
}
