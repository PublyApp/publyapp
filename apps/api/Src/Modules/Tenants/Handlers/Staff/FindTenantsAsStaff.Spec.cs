namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class FindTenantsAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantsAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithDefaultPagination() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = TenantTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

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
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		var url = TenantTestHelper.GetFindUrl();
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldNotGrantPermissionsFromSoftDeletedProfileAssignments() {
		var (staffToken, staffUserId) = await CreateUnprivilegedStaffUserAsync();
		var adminToken = await _authClient.LoginAsStaffAdminAsync();

		var profileId = await CreateStaffProfileAsync(
			adminToken,
			permissions: [AppPermissions.Staff.Tenants.LIST.Key]
		);

		await UpdateStaffUserProfilesAsync(
			adminToken,
			staffUserId,
			profileIds: [profileId]
		);

		var url = TenantTestHelper.GetFindUrl();

		// With the profile assigned, access should be granted.
		using (var okRequest = new HttpRequestMessage(HttpMethod.Get, url).WithSessionToken(staffToken)) {
			using var okResponse = await _http.SendAsync(okRequest);
			okResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		// Unassign: Update endpoint soft-deletes the join rows.
		await UpdateStaffUserProfilesAsync(
			adminToken,
			staffUserId,
			profileIds: []
		);

		// Access must be revoked immediately (no stale permission from soft-deleted links).
		using var forbiddenRequest = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(staffToken);
		using var forbiddenResponse = await _http.SendAsync(forbiddenRequest);
		forbiddenResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldReturnNextCursorWhenMoreResultsExist() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = TenantTestHelper.GetFindUrl(
			limit: 2,
			sortId: "name",
			sortOrder: "asc"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Count.Should().Be(2);
		result.NextCursor.Should()
			.NotBeNullOrEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnSecondPageWhenCursorProvided() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url1 = TenantTestHelper.GetFindUrl(
			limit: 2,
			sortId: "name",
			sortOrder: "asc"
		);
		var request1 = new HttpRequestMessage(
			HttpMethod.Get, url1
		).WithSessionToken(token);

		using var response1 =
			await _http.SendAsync(request1);
		response1.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var page1 = await response1.Content
			.ReadFromJsonAsync<FindResponse>();
		page1.Should().NotBeNull();
		page1!.NextCursor.Should()
			.NotBeNullOrEmpty();
		page1.Data.Count.Should().Be(2);

		var url2 = TenantTestHelper.GetFindUrl(
			cursor: page1.NextCursor,
			limit: 2,
			sortId: "name",
			sortOrder: "asc"
		);
		var request2 = new HttpRequestMessage(
			HttpMethod.Get, url2
		).WithSessionToken(token);

		using var response2 =
			await _http.SendAsync(request2);
		response2.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var page2 = await response2.Content
			.ReadFromJsonAsync<FindResponse>();
		page2.Should().NotBeNull();
		page2!.Data.Should().NotBeEmpty();

		var page1Ids = page1.Data.Select(t => t.Id).ToHashSet();
		page2.Data.Should().OnlyContain(
			t => !page1Ids.Contains(t.Id)
		);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForMalformedCursor() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = TenantTestHelper.GetFindUrl(
			cursor: "not-a-guid"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

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
	ItShouldReturnBadRequestForCursorNotFound() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = TenantTestHelper.GetFindUrl(
			cursor: Guid.NewGuid().ToString()
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForInvalidSortId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = TenantTestHelper.GetFindUrl(
			sortId: "not-a-sort-field"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturn422ForInvalidStatusToken() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = TenantTestHelper.GetFindUrl(
			status: "active,wat"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldFilterBySearchQuery() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = TenantTestHelper.GetFindUrl(
			q: "acme"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().Contain(
			t => t.Name == SeedConstants.Tenants.AcmeName
		);
	}

	[Fact]
	public async Task
	ItShouldMatchByCodePrefix() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// Acme tenant code is "acme-corp" while its name does not contain "acme-",
		// so this exercises prefix search on code (not substring).
		var url = TenantTestHelper.GetFindUrl(
			q: "acme-"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().Contain(
			t => t.Name == SeedConstants.Tenants.AcmeName
		);
	}

	[Fact]
	public async Task
	ItShouldFilterByMultipleStatuses() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var tenantId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				token,
				SeedConstants.Tenants.AcmeName
			);

		using var suspendResponse =
			await TenantTestHelper.SuspendTenantAsync(
				_http,
				token,
				tenantId
			);
		suspendResponse.EnsureSuccessStatusCode();

		try {
			var url = TenantTestHelper.GetFindUrl(
				status: "active,suspended"
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			result.Should().NotBeNull();
			result!.Data.Should().Contain(
				t => t.Status == "Suspended"
			);
			result.Data.Should().Contain(
				t => t.Status == "Active"
			);
		} finally {
			try {
				using var cleanup =
					await TenantTestHelper
						.ReactivateTenantAsync(
							_http, token, tenantId
						);
			} catch {
				// Ignore — cleanup best-effort
			}
		}
	}

	private async Task<(string token, string userId)> CreateUnprivilegedStaffUserAsync() {
		var email = $"no-perms-tenants-{Guid.NewGuid():N}@example.com";

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "User",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId, AccountLevel.User);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		var token = await _authClient.LoginAsync(email, TestConstants.SeedPassword);
		return (token, userId.ToString());
	}

	private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
		var (token, _) = await CreateUnprivilegedStaffUserAsync();
		return token;
	}

	private static string GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	private static string GetUpdateUserProfilesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.UpdateFn(userId)
		);
	}

	private async Task<string> CreateStaffProfileAsync(
		string staffToken,
		string[] permissions
	) {
		var url = GetCreateProfileUrl();
		var name = "TenantsPerms " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(HttpMethod.Post, url)
			.WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			name,
			description = "Profile created by FindTenantsAsStaffSpec",
			permissions,
			emails = Array.Empty<string>(),
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created =
			await response.Content.ReadFromJsonAsync<StaffProfileCreatedResponse>();
		created.Should().NotBeNull();
		return created!.ProfileId.ToString();
	}

	private async Task UpdateStaffUserProfilesAsync(
		string adminToken,
		string userId,
		string[] profileIds
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUpdateUserProfilesUrl(userId)
		).WithSessionToken(adminToken);

		request.Content = JsonContent.Create(new { profileIds });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}

	private record FindResponse {
		public List<TenantListItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private record TenantListItem {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public int UsersCount { get; init; }
		public string Status { get; init; } = string.Empty;
	}
}
