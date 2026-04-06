namespace MainApi.Src.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class FindTenantUsersAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantUsersAsStaffSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
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
	ItShouldReturnUnprocessableEntityWhenStatusIsPending() {
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
			tenantId,
			status: "pending"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
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

	[Fact]
	public async Task
	ItShouldFilterTenantUsersByMultipleStatusesWhenCommaSeparated() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		using (
			var scope =
				_fixture.Factory.Services.CreateScope()
		) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			var tenantIdGuid = await dbContext.Tenant
				.Where(t => t.Name == SeedConstants.Tenants.AcmeName)
				.Select(t => t.Id)
				.FirstAsync();
			var acmeMembership = await dbContext.UserAccount
				.FirstAsync(ua =>
					ua.TenantId == tenantIdGuid
					&& ua.Scope == AccountScope.Tenant
					&& ua.User.Email == SeedConstants.Tenants.AcmeUserEmail
				);
			acmeMembership.IsSuspended = true;
			await dbContext.SaveChangesAsync();
		}

		var url = GetFindUrl(
			tenantId,
			status: "active,suspended"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().NotBeEmpty();
		result.Data.Select(user => user.Status)
			.Should()
			.OnlyContain(status =>
				status == "Active"
				|| status == "Suspended"
			);
		result.Data.Select(user => user.Status)
			.Should()
			.Contain("Active");
		result.Data.Select(user => user.Status)
			.Should()
			.Contain("Suspended");
	}

	[Fact]
	public async Task
	ItShouldKeepSuspendedTenantUsersVisibleInDefaultList() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		using (
			var scope =
				_fixture.Factory.Services.CreateScope()
		) {
			var dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			var tenantIdGuid = await dbContext.Tenant
				.Where(t => t.Name == SeedConstants.Tenants.AcmeName)
				.Select(t => t.Id)
				.FirstAsync();
			var acmeMembership = await dbContext.UserAccount
				.FirstAsync(ua =>
					ua.TenantId == tenantIdGuid
					&& ua.Scope == AccountScope.Tenant
					&& ua.User.Email == SeedConstants.Tenants.AcmeUserEmail
				);
			acmeMembership.IsSuspended = true;
			await dbContext.SaveChangesAsync();
		}

		var url = GetFindUrl(tenantId);
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().Contain(user =>
			string.Equals(
				user.Email,
				SeedConstants.Tenants.AcmeUserEmail,
				StringComparison.OrdinalIgnoreCase
			)
			&& user.Status == "Suspended"
		);
	}

	[Fact]
	public async Task
	ItShouldReturnGloballySuspendedStatusWhenUserIsGloballySuspendedAndMembershipIsActive() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		await SetTenantUserStatesAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail,
			isMembershipSuspended: false,
			isUserSuspended: true,
			userStatus: UserStatus.Suspended
		);

		try {
			var url = GetFindUrl(tenantId);
			var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			result.Should().NotBeNull();
			result!.Data.Should().Contain(user =>
				string.Equals(
					user.Email,
					SeedConstants.Tenants.AcmeUserEmail,
					StringComparison.OrdinalIgnoreCase
				)
				&& user.Status == "GloballySuspended"
			);
		} finally {
			await SetTenantUserStatesAsync(
				tenantId,
				SeedConstants.Tenants.AcmeUserEmail,
				isMembershipSuspended: false,
				isUserSuspended: false,
				userStatus: UserStatus.Active
			);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnGloballySuspendedStatusWhenUserIsGloballySuspendedAndMembershipIsSuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		await SetTenantUserStatesAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail,
			isMembershipSuspended: true,
			isUserSuspended: true,
			userStatus: UserStatus.Suspended
		);

		try {
			var url = GetFindUrl(tenantId);
			var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			result.Should().NotBeNull();
			result!.Data.Should().Contain(user =>
				string.Equals(
					user.Email,
					SeedConstants.Tenants.AcmeUserEmail,
					StringComparison.OrdinalIgnoreCase
				)
				&& user.Status == "GloballySuspended"
			);
		} finally {
			await SetTenantUserStatesAsync(
				tenantId,
				SeedConstants.Tenants.AcmeUserEmail,
				isMembershipSuspended: false,
				isUserSuspended: false,
				userStatus: UserStatus.Active
			);
		}
	}

	[Fact]
	public async Task
	ItShouldExcludeGloballySuspendedUsersFromActiveAndSuspendedFilters() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		await SetTenantUserStatesAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail,
			isMembershipSuspended: false,
			isUserSuspended: true,
			userStatus: UserStatus.Suspended
		);

		try {
			var activeRequest = new HttpRequestMessage(
				HttpMethod.Get,
				GetFindUrl(tenantId, status: "active")
			).WithSessionToken(staffToken);

			using var activeResponse =
				await _http.SendAsync(activeRequest);

			activeResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var activeResult = await activeResponse.Content
				.ReadFromJsonAsync<FindResponse>();
			activeResult.Should().NotBeNull();
			activeResult!.Data.Should().NotContain(user =>
				string.Equals(
					user.Email,
					SeedConstants.Tenants.AcmeUserEmail,
					StringComparison.OrdinalIgnoreCase
				)
			);

			var suspendedRequest = new HttpRequestMessage(
				HttpMethod.Get,
				GetFindUrl(tenantId, status: "suspended")
			).WithSessionToken(staffToken);

			using var suspendedResponse =
				await _http.SendAsync(suspendedRequest);

			suspendedResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var suspendedResult = await suspendedResponse.Content
				.ReadFromJsonAsync<FindResponse>();
			suspendedResult.Should().NotBeNull();
			suspendedResult!.Data.Should().NotContain(user =>
				string.Equals(
					user.Email,
					SeedConstants.Tenants.AcmeUserEmail,
					StringComparison.OrdinalIgnoreCase
				)
			);
		} finally {
			await SetTenantUserStatesAsync(
				tenantId,
				SeedConstants.Tenants.AcmeUserEmail,
				isMembershipSuspended: false,
				isUserSuspended: false,
				userStatus: UserStatus.Active
			);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnOnlyGloballySuspendedUsersWhenStatusFilterIsGloballySuspended() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		await SetTenantUserStatesAsync(
			tenantId,
			SeedConstants.Tenants.AcmeUserEmail,
			isMembershipSuspended: false,
			isUserSuspended: true,
			userStatus: UserStatus.Suspended
		);

		try {
			var url = GetFindUrl(
				tenantId,
				status: "globally_suspended"
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			result.Should().NotBeNull();
			result!.Data.Should().NotBeEmpty();
			result.Data.Should().OnlyContain(user =>
				user.Status == "GloballySuspended"
			);
			result.Data.Should().Contain(user =>
				string.Equals(
					user.Email,
					SeedConstants.Tenants.AcmeUserEmail,
					StringComparison.OrdinalIgnoreCase
				)
			);
		} finally {
			await SetTenantUserStatesAsync(
				tenantId,
				SeedConstants.Tenants.AcmeUserEmail,
				isMembershipSuspended: false,
				isUserSuspended: false,
				userStatus: UserStatus.Active
			);
		}
	}

	[Fact]
	public async Task
	ItShouldSortByStatusWithoutServerError() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl(
				tenantId,
				sortId: "status",
				sortOrder: "desc"
			)
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

	// -- URL builder --

	private static string GetFindUrl(
		Guid tenantId,
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? status = null
	) {
		return GetFindUrl(
			tenantId.ToString(),
			cursor,
			limit,
			sortId,
			sortOrder,
			status
		);
	}

	private static string GetFindUrl(
		string tenantId,
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? status = null
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
		if (status is not null) {
			queryParams.Add($"status={status}");
		}

		if (queryParams.Count > 0) {
			return $"{basePath}?{string.Join("&", queryParams)}";
		}

		return basePath;
	}

	private async Task SetTenantUserStatesAsync(
		Guid tenantId,
		string email,
		bool isMembershipSuspended,
		bool isUserSuspended,
		UserStatus userStatus
	) {
		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var membership = await dbContext.UserAccount
			.FirstAsync(ua =>
				ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.User.Email == email
			);
		var user = await dbContext.User
			.FirstAsync(u => u.Email == email);

		membership.IsSuspended = isMembershipSuspended;
		user.IsSuspended = isUserSuspended;
		user.Status = userStatus;

		await dbContext.SaveChangesAsync();
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
