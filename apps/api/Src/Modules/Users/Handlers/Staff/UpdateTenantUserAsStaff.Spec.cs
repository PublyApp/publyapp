namespace MainApi.Src.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class UpdateTenantUserAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateTenantUserAsStaffSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUpdateUrl(
		string tenantId,
		string userId
	) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.UpdateFn(tenantId, userId)
		);
	}

	[Fact]
	public async Task
	ItShouldUpdateLevelWhenValid() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Get user ID for a regular user in the tenant
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		var url = GetUpdateUrl(tenantId.ToString(), userId);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { level = "Admin" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<TenantUserDetailsResult>();
		result.Should().NotBeNull();
		result!.Level.Should().Be("Admin");

		var persistedLevel = await GetUserLevelByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);
		persistedLevel.Should().Be("Admin");

		// Reset back to User for other tests
		var resetRequest = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		resetRequest.Content = JsonContent.Create(
			new { level = "User" }
		);

		await _http.SendAsync(resetRequest);
	}

	[Fact]
	public async Task
	ItShouldClearAvatarUrlWhenExplicitNull() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// First set an avatar URL
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		var setUrl = GetUpdateUrl(tenantId.ToString(), userId);
		var setRequest = new HttpRequestMessage(
			HttpMethod.Patch, setUrl
		).WithSessionToken(staffToken);

		setRequest.Content = JsonContent.Create(
			new { avatarUrl = "https://example.com/avatar.png" }
		);

		using var setResponse =
			await _http.SendAsync(setRequest);

		setResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Now clear it with null
		var clearUrl = GetUpdateUrl(tenantId.ToString(), userId);
		var clearRequest = new HttpRequestMessage(
			HttpMethod.Patch, clearUrl
		).WithSessionToken(staffToken);

		clearRequest.Content = JsonContent.Create(
			new { avatarUrl = (string?)null }
		);

		using var clearResponse =
			await _http.SendAsync(clearRequest);

		clearResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await clearResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResult>();
		result.Should().NotBeNull();
		result!.AvatarUrl.Should().BeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenNoFields() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		var url = GetUpdateUrl(tenantId.ToString(), userId);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { });

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenMalformedTenantId() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		var url = GetUpdateUrl(
			"not-a-guid",
			Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { firstName = "Test" }
		);

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

		var url = GetUpdateUrl(
			tenantId.ToString(),
			"not-a-guid"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { firstName = "Test" }
		);

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
	ItShouldClearFirstNameWhenNullIsProvided() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Get user ID for a regular user in the tenant
		var userId = await GetUserIdByEmailAsync(
			_http,
			staffToken,
			tenantId,
			TestConstants.AcmeUserEmail
		);

		// First set firstName to a value
		var setUrl = GetUpdateUrl(tenantId.ToString(), userId);
		var setRequest = new HttpRequestMessage(
			HttpMethod.Patch, setUrl
		).WithSessionToken(staffToken);

		setRequest.Content = JsonContent.Create(
			new { firstName = "John", lastName = "Doe" }
		);

		using var setResponse =
			await _http.SendAsync(setRequest);

		setResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Now clear firstName with explicit null
		var clearUrl = GetUpdateUrl(tenantId.ToString(), userId);
		var clearRequest = new HttpRequestMessage(
			HttpMethod.Patch, clearUrl
		).WithSessionToken(staffToken);

		clearRequest.Content = JsonContent.Create(
			new { firstName = (string?)null }
		);

		using var clearResponse =
			await _http.SendAsync(clearRequest);

		clearResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await clearResponse.Content
			.ReadFromJsonAsync<TenantUserDetailsResult>();
		result.Should().NotBeNull();
		result!.FirstName.Should().BeNull();
		result.LastName.Should().Be("Doe");
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenDemotingLastAdmin() {
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

		var url = GetUpdateUrl(tenantId.ToString(), userId);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		// Try to demote from Admin to User
		request.Content = JsonContent.Create(
			new { level = "User" }
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should()
			.Be(ResponseKeys.CannotDemoteLastAdmin);
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

		var url = GetUpdateUrl(tenantId.ToString(), userId);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { firstName = "Test" }
		);

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

		var url = GetUpdateUrl(
			tenantId.ToString(),
			Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		);

		request.Content = JsonContent.Create(
			new { firstName = "Test" }
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

		var url = GetUpdateUrl(
			tenantId.ToString(),
			Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(tenantToken);

		request.Content = JsonContent.Create(
			new { firstName = "Test" }
		);

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

		var url = GetUpdateUrl(
			tenantId.ToString(),
			Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Patch, url
		).WithSessionToken(staffUserToken);

		request.Content = JsonContent.Create(
			new { firstName = "Test" }
		);

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

	private static async Task<string> GetUserLevelByEmailAsync(
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

		return user.Level;
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
