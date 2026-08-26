using Microsoft.AspNetCore.Http.HttpResults;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public class TenantForPickerItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string Code { get; set; } = string.Empty;
	public TenantStatus Status { get; set; }
}

public class GetUserTenantsForPickerResponse {
	public List<TenantForPickerItem> Tenants { get; set; } = [];
	public int TotalCount { get; set; }
	public int ActiveCount { get; set; }
	public bool HasSuspendedTenants { get; set; }
}

public sealed class GetUserTenantsForPicker {
	private const int MaxTenantsInList = 50;

	public static async Task<Ok<GetUserTenantsForPickerResponse>> Handle(
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
			throw new InvalidOperationException(
				"GetUserTenantsForPicker must be set behind SessionAuthFilter."
			);
		}

		if (authContext.UserId is not Guid userId) {
			throw new InvalidOperationException($"{nameof(authContext.UserId)} is not a GUID");
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
			}).ToList(),
			TotalCount = result.TotalCount,
			ActiveCount = result.ActiveCount,
			HasSuspendedTenants = result.HasSuspendedTenants
		});
	}
}
