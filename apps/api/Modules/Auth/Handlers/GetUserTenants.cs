using Microsoft.AspNetCore.Http.HttpResults;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

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

public sealed class GetUserTenants {
	private const int MaxTenantsInList = 5;

	public static async Task<Ok<GetUserTenantsResult>> Handle(
		IRequestAuthContext authContext,
		ILogger<GetUserTenants> logger,
		IAccountService accountService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError("{@GetUserTenants}", new {
					UserId = authContext.UserId,
					HasSessionToken = authContext.SessionToken is not null
				});
			}
			throw new InvalidOperationException("GetUserTenants must be set behind SessionAuthFilter.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException($"{nameof(authContext.UserId)} is not a GUID");
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
