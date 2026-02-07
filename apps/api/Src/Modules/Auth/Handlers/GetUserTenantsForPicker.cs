using MainApi.Src.Lib;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;

namespace MainApi.Src.Modules.Auth.Handlers;

public class TenantForPickerItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string Code { get; set; } = string.Empty;
	public string Status { get; set; } = string.Empty;
	public bool IsSuspended { get; set; }
	public bool IsActive { get; set; }
}

public class GetUserTenantsForPickerResponse {
	public List<TenantForPickerItem> Tenants { get; set; } = [];
	public int TotalCount { get; set; }
	public int ActiveCount { get; set; }
	public bool HasSuspendedTenants { get; set; }
}

public class GetUserTenantsForPicker {
	private const int MaxTenantsInList = 50;

	public static async Task<Ok<GetUserTenantsForPickerResponse>> HandleGetUserTenantsForPicker(
		IRequestAuthContext authContext,
		ILogger<GetUserTenantsForPicker> logger,
		IAccountService accountService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			if (logger.IsEnabled(LogLevel.Error)) {
				logger.LogError("{@GetUserTenantsForPicker}", new {
					UserId = authContext.UserId,
					HasSessionToken = authContext.SessionToken is not null
				});
			}
			throw new Exception($"GetUserTenantsForPicker must be set behind SessionAuthFilter.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new Exception($"{nameof(authContext.UserId)} is not a GUID");
		}

		var result = await accountService.GetUserTenantsForPickerAsync(
			userId, MaxTenantsInList, cancellationToken
		);

		return TypedResults.Ok(new GetUserTenantsForPickerResponse {
			Tenants = result.Tenants.Select(t => new TenantForPickerItem {
				Id = t.Id,
				Name = t.Name,
				Code = t.Code,
				Status = t.Status,
				IsSuspended = t.IsSuspended,
				IsActive = t.IsActive
			}).ToList(),
			TotalCount = result.TotalCount,
			ActiveCount = result.ActiveCount,
			HasSuspendedTenants = result.HasSuspendedTenants
		});
	}
}
