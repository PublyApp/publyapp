
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Handlers.Staff;

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
		Assert.NotNull(result);
		result.Data.Should().NotBeEmpty();
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
		Assert.NotNull(result);
		result.Data.Count.Should().Be(2);
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
		Assert.NotNull(page1);
		page1.NextCursor.Should()
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
		Assert.NotNull(page2);
		page2.Data.Should().NotBeEmpty();

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
		Assert.NotNull(result);
		result.Data.Should().Contain(
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
		Assert.NotNull(result);
		result.Data.Should().Contain(
					t => t.Name == SeedConstants.Tenants.AcmeName
				);
	}

	[Fact]
	public async Task
	ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcard() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var withPercent = new Tenant {
			Name = $"Has%Percent{marker}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		var withoutPercent = new Tenant {
			Name = $"NoPercentAtAll{marker}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddRangeAsync(withPercent, withoutPercent);
		await dbContext.SaveChangesAsync();

		var url = TenantTestHelper.GetFindUrl(
			q: Uri.EscapeDataString("%"),
			limit: 100
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
		Assert.NotNull(result);

		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%"
		// collapses to a bare wildcard matching every row. Escaped, only the
		// tenant whose name literally contains '%' may match.
		result.Data.Should().Contain(t => t.Name == $"Has%Percent{marker}");
		result.Data.Should().NotContain(t => t.Name == $"NoPercentAtAll{marker}");
	}

	[Fact]
	public async Task
	ItShouldExcludeSoftDeletedUsersFromUsersCountInTenantsListAggregate() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];
		var tenantName = $"Tenant List Soft Deleted User {marker}";
		var tenantId = await SeedTenantWithSoftDeletedUserForFindAsync(tenantName);

		var url = TenantTestHelper.GetFindUrl(q: tenantName);
		var request = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(staffToken);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var match = result.Data.Should().ContainSingle(
			t => t.Id == tenantId
		).Subject;
		match.UsersCount.Should().Be(2);
	}

	[Fact]
	public async Task
	ItShouldTreatABareUnderscoreSearchAsALiteralCharacterNotAWildcard() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var withUnderscore = new Tenant {
			Name = $"Has_Underscore{marker}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		var withoutUnderscore = new Tenant {
			Name = $"NoUnderscoreHere{marker}",
			Code = $"d{Guid.NewGuid().ToString("N")[..9]}",
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddRangeAsync(withUnderscore, withoutUnderscore);
		await dbContext.SaveChangesAsync();

		var url = TenantTestHelper.GetFindUrl(
			q: Uri.EscapeDataString("_"),
			limit: 100
		);
		var request = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(t => t.Name == $"Has_Underscore{marker}");
		result.Data.Should().NotContain(t => t.Name == $"NoUnderscoreHere{marker}");
	}

	[Fact]
	public async Task
	ItShouldTreatABareBackslashSearchAsALiteralCharacterNotAWildcard() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var withBackslash = new Tenant {
			Name = $"Has\\Backslash{marker}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		var withoutBackslash = new Tenant {
			Name = $"NoBackslashHere{marker}",
			Code = $"c{Guid.NewGuid().ToString("N")[..9]}",
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddRangeAsync(withBackslash, withoutBackslash);
		await dbContext.SaveChangesAsync();

		var url = TenantTestHelper.GetFindUrl(
			q: Uri.EscapeDataString(@"\"),
			limit: 100
		);
		var request = new HttpRequestMessage(HttpMethod.Get, url)
			.WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		result.Data.Should().Contain(t => t.Name == $"Has\\Backslash{marker}");
		result.Data.Should().NotContain(t => t.Name == $"NoBackslashHere{marker}");
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
			Assert.NotNull(result);
			result.Data.Should().Contain(
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
			.GetRequiredService<AppDbContext>();

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

	private async Task<Guid> SeedTenantWithSoftDeletedUserForFindAsync(
		string tenantName
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = tenantName,
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		await AddFindTenantUserAsync(
			dbContext,
			tenantId,
			isUserDeleted: false,
			AccountLevel.Admin
		);
		await AddFindTenantUserAsync(
			dbContext,
			tenantId,
			isUserDeleted: false,
			AccountLevel.User
		);
		await AddFindTenantUserAsync(
			dbContext,
			tenantId,
			isUserDeleted: true,
			AccountLevel.User
		);

		return tenantId;
	}

	private static async Task AddFindTenantUserAsync(
		AppDbContext dbContext,
		Guid tenantId,
		bool isUserDeleted,
		AccountLevel level
	) {
		var user = new User {
			Email = $"tenant-find-user-{Guid.NewGuid():N}@example.com",
			Password = PasswordUtils.HashPassword(
				TestConstants.SeedPassword
			),
			FirstName = "Find",
			LastName = "Tenant",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateTenantAccount(
				user.GetRequiredId(), tenantId, level
			)
		);
		if (isUserDeleted) {
			user.IsDeleted = true;
		}

		await dbContext.SaveChangesAsync();
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
		Assert.NotNull(created);
		return created.ProfileId.ToString();
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

	[Fact]
	public async Task ItShouldAcceptAnUppercaseSortId() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var url = TenantTestHelper.GetFindUrl(
			limit: 5,
			sortId: "NAME",
			sortOrder: "ASC"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(token);

		using var response =
			await _http.SendAsync(request);

		// The handler dictionary resolves keys case-insensitively; an
		// ordinal-sensitive lookup would turn this into a 400.
		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		// 3 tenants with distinct, deliberately NOT insertion-ordered CreatedAt
		// (anti-correlated). The walk must visit each once in ascending
		// CreatedAt order, not insertion order, so a keySelector swap to
		// another same-type field turns this assertion RED.
		var baseDate = new DateTime(
			2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
		);
		var seededIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			var createdAt = baseDate.AddDays((3 - i) % 3);
			seededIds.Add(await SeedTenantAtAsync(createdAt));
			seededOrder.Add(createdAt);
		}

		var visitedIds = new List<Guid>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = TenantTestHelper.GetFindUrl(
				cursor: cursor,
				limit: 1,
				sortId: "created_at",
				sortOrder: "asc"
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(token);

			using var response =
				await _http.SendAsync(request);
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var page = await response.Content
				.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(
				page.Data.Select(t => t.Id)
			);
			cursor = page.NextCursor;

			// Guard against an infinite loop if the cursor filter regresses.
			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		// The walk covers exactly our rows, each once, in order.
		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var createdAtById = seededIds
			.Zip(seededOrder, (id, c) => (id, c))
			.ToDictionary(x => x.id, x => x.c);
		visitedOrder.Should().Equal(
			seededIds.OrderBy(id => createdAtById[id]).ToList()
		);

		// Assert the OBSERVED sort order against the real Tenant.CreatedAt
		// values from the DB, in walk order. The item does not expose
		// CreatedAt, so resolve it by Id on Tenant.
		List<DateTime> observedOrder;
		{
			await using var scope =
				_fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			observedOrder = await dbContext.Tenant
				.Where(t => visitedOrder.Contains((Guid)t.Id!))
				.OrderBy(t => visitedOrder.IndexOf((Guid)t.Id!))
				.Select(t => t.CreatedAt)
				.ToListAsync();
		}
		observedOrder.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		observedOrder.Should().NotEqual(seededOrder);
	}

	private async Task<Guid> SeedTenantAtAsync(
		DateTime createdAt
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"Tenant Walk {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		// Two-phase: insert stamps CreatedAt/UpdatedAt = now; re-save Modified
		// only updates UpdatedAt, so the seeded CreatedAt sticks.
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var id = tenant.GetRequiredId();

		var tracked = await dbContext.Tenant
			.Where(t => t.Id == id)
			.FirstAsync();
		tracked.CreatedAt = createdAt;
		await dbContext.SaveChangesAsync();

		return id;
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
