using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Middlewares;
using MainApi.Src.Modules.Shared.Tenants;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Shared.Auth.Handlers;

public class TenantListItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string Code { get; set; } = string.Empty;
	public string? LogoUrl { get; set; }
}

public class GetUserTenantsResult {
	public List<TenantListItem> Tenants { get; set; } = [];
	public int TotalCount { get; set; }
}

public class GetUserTenants {
	private const int MaxTenantsInList = 5;

	public static async Task<Ok<GetUserTenantsResult>> HandleGetUserTenants(
		IRequestAuthContext authContext,
		ILogger<GetUserTenants> logger,
		MainApiDbContext dbContext,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			logger.LogError("{@GetUserTenants}", new {
				UserId = authContext.UserId,
				SessionToken = authContext.SessionToken
			});
			throw new Exception($"{nameof(GetUserTenants)} must be set behind {nameof(SessionAuthMiddleware)}.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new Exception($"{nameof(authContext.UserId)} is not a GUID");
		}

		// Get total count of user's tenant memberships
		var totalCount = await (
			from ua in dbContext.UserAccount
			join t in dbContext.Tenant on ua.TenantId equals t.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId != null
				&& !ua.IsDeleted && !ua.IsSuspended
				&& t.Status == TenantStatus.Active && !t.IsSuspended
			select ua
		).CountAsync(cancellationToken);

		// Get limited tenant list
		var tenants = await (
			from ua in dbContext.UserAccount
			join t in dbContext.Tenant on ua.TenantId equals t.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId != null
				&& !ua.IsDeleted && !ua.IsSuspended
				&& t.Status == TenantStatus.Active && !t.IsSuspended
			orderby t.Name
			select new TenantListItem {
				Id = t.Id!.Value,
				Name = t.Name,
				Code = t.Code,
				LogoUrl = t.LogoUrl
			}
		).Take(MaxTenantsInList).ToListAsync(cancellationToken);

		return TypedResults.Ok(new GetUserTenantsResult {
			Tenants = tenants,
			TotalCount = totalCount
		});
	}
}
