namespace MainApi.Src.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class FindTenantUsersAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantUsersAsStaffSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithDefaultCursorPagination() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var url = GetFindUrl(tenantId);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().NotBeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnNextCursorWhenMoreResultsExist() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var url = GetFindUrl(tenantId, limit: 1);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Count.Should().Be(1);
		result.NextCursor.Should()
			.NotBeNullOrEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenTenantIdIsMalformed() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		var url = GetFindUrl("not-a-guid");
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenCursorIsMalformed() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var url = GetFindUrl(
			tenantId, cursor: "not-a-guid"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenCursorRecordNotFound() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var nonExistentCursor = Guid.NewGuid();
		var url = GetFindUrl(
			tenantId, cursor: nonExistentCursor.ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWhenSortIdIsInvalid() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var url = GetFindUrl(
			tenantId, sortId: "nonexistent"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSession() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var url = GetFindUrl(tenantId);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUser() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = GetFindUrl(tenantId);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(tenantToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermission() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var staffUserToken =
			await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

		var url = GetFindUrl(tenantId);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffUserToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
	}

	// -- URL builder --

	private static string GetFindUrl(
		Guid tenantId,
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null
	) {
		return GetFindUrl(
			tenantId.ToString(),
			cursor,
			limit,
			sortId,
			sortOrder
		);
	}

	private static string GetFindUrl(
		string tenantId,
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null
	) {
		var basePath = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff
				.RootFn(tenantId),
			Routes.Users.ForTenantAsStaff.Find
		);

		var queryParams = new List<string>();

		if (cursor is not null) {
			queryParams.Add($"cursor={cursor}");
		}
		if (limit is not null) {
			queryParams.Add($"limit={limit}");
		}
		if (sortId is not null) {
			queryParams.Add($"sort_id={sortId}");
		}
		if (sortOrder is not null) {
			queryParams.Add($"sort_order={sortOrder}");
		}

		if (queryParams.Count > 0) {
			return $"{basePath}?{string.Join("&", queryParams)}";
		}

		return basePath;
	}

	// -- Response DTOs --

	private record FindResponse {
		public List<TenantUserItemDto> Data { get; init; }
			= [];
		public string? NextCursor { get; init; }
	}

	private record TenantUserItemDto {
		public string Id { get; init; } = string.Empty;
		public string Email { get; init; }
			= string.Empty;
		public string? LastName { get; init; }
		public string? FirstName { get; init; }
		public string? AvatarUrl { get; init; }
		public string Status { get; init; }
			= string.Empty;
		public string Level { get; init; }
			= string.Empty;
	}
}
