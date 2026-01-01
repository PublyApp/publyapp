using FluentValidation;

using MainApi.Src.Lib;
using MainApi.Src.Lib.Middlewares;
using MainApi.Src.Modules.Shared.Tenants;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Shared.Auth.Handlers;

public class GetRedirectCodeQuery {
	public string? TenantId { get; set; }

	public Guid? GetTenantId() {
		return Guid.TryParse(TenantId, out var tenantId) ? tenantId : null;
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
	public static async Task<Ok<GetRedirectCodeResult>> HandleGetRedirectCode(
		[AsParameters] GetRedirectCodeQuery query,
		IRequestAuthContext authContext,
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

		logger.LogInformation(
			"User {UserId} isStaffMember: {IsStaffMember}, tenantId from query: {TenantId}",
			userId,
			isUserStaffMember,
			tenantId
		);

		if (isUserStaffMember) {
			if (tenantId is not Guid guidTenantIdAsStaff) {
				return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "staff" });
			}

			var tenantFoundAsStaff = await tenantService.GetTenantByIdAsync(guidTenantIdAsStaff, cancellationToken);

			if (tenantFoundAsStaff is not null) {
				return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = tenantFoundAsStaff.GetRequiredId().ToString() });
			}

			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "staff" });
		}

		// User is not a staff member, check tenant access
		if (tenantId is not Guid guidTenantIdAsMember) {
			// No tenantId provided, find user's first tenant account
			var userFirstTenantAccount = await accountService.FindUserTenantAccountsAsync(
				userId, limit: 1, cancellationToken: cancellationToken
			);

			logger.LogInformation(
				"FindUserTenantAccountsAsync for user {UserId} returned {Count} accounts",
				userId,
				userFirstTenantAccount.Count
			);

			var firstTenant = userFirstTenantAccount.FirstOrDefault();

			if (firstTenant?.TenantId is not null) {
				logger.LogInformation(
					"Redirecting user {UserId} to tenant {TenantId}",
					userId,
					firstTenant.TenantId.Value
				);
				return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = firstTenant.TenantId.Value.ToString() });
			}

			logger.LogWarning(
				"User {UserId} has no tenant accounts, returning unauthorized",
				userId
			);
			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
		}

		logger.LogInformation(
			"User {UserId} provided tenantId {TenantId}, checking access",
			userId,
			guidTenantIdAsMember
		);

		var tenantFound = await tenantService.GetTenantByIdAsync(guidTenantIdAsMember, cancellationToken);

		if (tenantFound is not null) {
			var isMember = await accountService.IsUserMemberOfTenantAsync(userId, guidTenantIdAsMember, cancellationToken);

			logger.LogInformation(
				"User {UserId} isMember of tenant {TenantId}: {IsMember}",
				userId,
				guidTenantIdAsMember,
				isMember
			);

			if (isMember) {
				return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = tenantFound.GetRequiredId().ToString() });
			}

			logger.LogWarning(
				"Attempt to access tenant {TenantId} by user {UserId} who is not a member of said tenant",
				tenantId,
				userId
			);

			return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
		}

		logger.LogInformation(
			"Tenant {TenantId} not found or inactive, looking for fallback",
			guidTenantIdAsMember
		);

		// Get fallback tenant (first tenant the user is a member of)
		var userTenantAccounts = await accountService.FindUserTenantAccountsAsync(
			userId, limit: 1, cancellationToken: cancellationToken
		);

		logger.LogInformation(
			"Fallback search for user {UserId} returned {Count} accounts",
			userId,
			userTenantAccounts.Count
		);

		var fallbackTenant = userTenantAccounts.FirstOrDefault();

		if (fallbackTenant?.TenantId is not null) {
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
