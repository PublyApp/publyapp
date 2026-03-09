namespace MainApi.Src.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class RemoveUserFromTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public RemoveUserFromTenantAsStaffSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetRemoveUrl(
		string tenantId,
		string userId
	) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.DeleteFn(tenantId, userId)
		);
	}

	[Fact]
	public async Task
	ItShouldRemoveUserSuccessfully() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Get a regular user (not admin) to remove
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		var url = GetRemoveUrl(tenantId.ToString(), userId);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ApiResponse>();
		result.Should().NotBeNull();
		result!.Message.Should().Contain("removed");
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenRemovingLastAdmin() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		// TechStart has only ONE admin (TechStartAdminEmail)
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Get the admin user
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.TechStartAdminEmail
		);

		var url = GetRemoveUrl(tenantId.ToString(), userId);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.CannotRemoveLastAdmin);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenMalformedTenantId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		var url = GetRemoveUrl(
			"not-a-guid",
			Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenMalformedUserId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var url = GetRemoveUrl(
			tenantId.ToString(),
			"not-a-guid"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenUserNotInTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Use a user from a different tenant
		var otherTenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			otherTenantId,
			TestConstants.TechStartAdminEmail
		);

		var url = GetRemoveUrl(tenantId.ToString(), userId);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				await _authClient.LoginAsStaffAdminAsync(),
				SeedConstants.Tenants.AcmeName
			);

		var url = GetRemoveUrl(
			tenantId.ToString(),
			Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				await _authClient.LoginAsStaffAdminAsync(),
				SeedConstants.Tenants.AcmeName
			);

		var url = GetRemoveUrl(
			tenantId.ToString(),
			Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(tenantToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var staffUserToken = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				await _authClient.LoginAsStaffAdminAsync(),
				SeedConstants.Tenants.AcmeName
			);

		var url = GetRemoveUrl(
			tenantId.ToString(),
			Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Delete, url
		).WithSessionToken(staffUserToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	// -- Helper methods --

	private static async Task<string> GetUserIdByEmailAsync(
		HttpClient http,
		string staffToken,
		Guid tenantId,
		string email
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.RootFn(
				tenantId.ToString()
			),
			Routes.Users.ForTenantAsStaff.Find
		) + "?limit=50";

		using var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response = await http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var result = await response.Content
			.ReadFromJsonAsync<FindUsersResponse>();
		if (result is null) {
			throw new InvalidOperationException(
				"Failed to deserialize user list response"
			);
		}

		var user = result.Data.FirstOrDefault(
			u => string.Equals(
				u.Email,
				email,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (user is null) {
			throw new InvalidOperationException(
				$"User with email '{email}' not found in tenant"
			);
		}

		return user.Id;
	}

	// -- Response DTOs --

	private record FindUsersResponse {
		public List<TenantUserItem> Data { get; init; }
			= [];
		public string? NextCursor { get; init; }
	}

	private record TenantUserItem {
		public string Id { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
		public string? FirstName { get; init; }
		public string? LastName { get; init; }
		public string? AvatarUrl { get; init; }
		public string Level { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
	}
}
