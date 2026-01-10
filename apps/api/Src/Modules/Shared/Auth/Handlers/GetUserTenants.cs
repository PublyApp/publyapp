using MainApi.Src.Lib;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;

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
		IAccountService accountService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError("{@GetUserTenants}", new {
					UserId = authContext.UserId,
					SessionToken = authContext.SessionToken
				});
			}
			throw new Exception($"GetUserTenants must be set behind SessionAuthFilter.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new Exception($"{nameof(authContext.UserId)} is not a GUID");
		}

		var result = await accountService.GetUserTenantsAsync(userId, MaxTenantsInList, cancellationToken);

		return TypedResults.Ok(new GetUserTenantsResult {
			Tenants = result.Tenants.Select(t => new TenantListItem {
				Id = t.Id,
				Name = t.Name,
				Code = t.Code,
				LogoUrl = t.LogoUrl
			}).ToList(),
			TotalCount = result.TotalCount
		});
	}
}
