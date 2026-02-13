namespace MainApi.Src.Lib.Testing.Helpers;

using System.Net.Http.Json;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;

/// <summary>
/// Shared helpers for tenant suspension integration tests.
/// Provides methods to look up tenant IDs and perform
/// suspend/reactivate operations via the staff API.
/// </summary>
internal static class TenantTestHelper {
	private static readonly string FindTenantsUrl =
		PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.Find
		) + "?limit=50&sortId=name&sortOrder=asc";

	/// <summary>
	/// Finds a tenant ID by its name via GET /staff/tenants.
	/// Uses a deterministic sort (name asc) and limit=50 to
	/// avoid pagination surprises.
	/// </summary>
	public static async Task<Guid> GetTenantIdByNameAsync(
		HttpClient http,
		string staffToken,
		string tenantName,
		CancellationToken ct = default
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindTenantsUrl
		).WithSessionToken(staffToken);

		using var response =
			await http.SendAsync(request, ct);
		response.EnsureSuccessStatusCode();

		var result = await response.Content
			.ReadFromJsonAsync<TenantListResponse>(ct)
			?? throw new InvalidOperationException(
				"GET /staff/tenants returned null "
				+ "or unexpected JSON shape"
			);

		var tenant = result.Tenants.FirstOrDefault(
			t => string.Equals(
				t.Name,
				tenantName,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (tenant is null) {
			var available = string.Join(
				", ",
				result.Tenants.Select(t => t.Name)
			);
			throw new InvalidOperationException(
				$"Tenant '{tenantName}' not found. "
				+ $"Available: [{available}]"
			);
		}

		return tenant.Id;
	}

	/// <summary>
	/// Suspends a tenant via
	/// POST /staff/tenants/{id}/suspend.
	/// </summary>
	public static async Task<HttpResponseMessage>
	SuspendTenantAsync(
		HttpClient http,
		string staffToken,
		Guid tenantId,
		CancellationToken ct = default
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.SuspendFn(
				tenantId.ToString()
			)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { }
		);

		return await http.SendAsync(request, ct);
	}

	/// <summary>
	/// Suspends a tenant with a reason via
	/// POST /staff/tenants/{id}/suspend.
	/// </summary>
	public static async Task<HttpResponseMessage>
	SuspendTenantWithReasonAsync(
		HttpClient http,
		string staffToken,
		Guid tenantId,
		string reason,
		CancellationToken ct = default
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.SuspendFn(
				tenantId.ToString()
			)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { reason }
		);

		return await http.SendAsync(request, ct);
	}

	/// <summary>
	/// Reactivates a tenant via
	/// POST /staff/tenants/{id}/reactivate.
	/// </summary>
	public static async Task<HttpResponseMessage>
	ReactivateTenantAsync(
		HttpClient http,
		string staffToken,
		Guid tenantId,
		CancellationToken ct = default
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.ReactivateFn(
				tenantId.ToString()
			)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		return await http.SendAsync(request, ct);
	}

	/// <summary>
	/// Builds the suspend URL for a given tenant ID.
	/// Useful when callers need custom request setup.
	/// </summary>
	public static string GetSuspendUrl(Guid tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.SuspendFn(
				tenantId.ToString()
			)
		);
	}

	/// <summary>
	/// Builds the reactivate URL for a given tenant ID.
	/// </summary>
	public static string GetReactivateUrl(Guid tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Tenants.ForStaff.Root,
			Routes.Tenants.ForStaff.ReactivateFn(
				tenantId.ToString()
			)
		);
	}

	// Response DTOs for tenant list deserialization
	private record TenantListResponse {
		public List<TenantListItem> Tenants { get; init; }
			= [];
		public int Count { get; init; }
	}

	private record TenantListItem {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? LogoUrl { get; init; }
		public int UsersCount { get; init; }
		public int MaxUsers { get; init; }
		public string Status { get; init; } = string.Empty;
		public bool IsSuspended { get; init; }
	}
}
