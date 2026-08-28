
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

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
		Assert.NotNull(result);
		result.Data.Should().NotBeEmpty();
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
		Assert.NotNull(result);
		result.Data.Count.Should().Be(1);
		result.NextCursor.Should()
			.NotBeNullOrEmpty();
	}

	[Fact]
	public async Task
	ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcardForEveryRow() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];
		var tenantId = await SeedTenantWithSearchFixtureAsync(marker);

		var url = GetFindUrl(tenantId, search: "%");
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
		Assert.NotNull(result);

		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%"
		// collapses to a bare wildcard matching every row. Escaped, only the
		// user whose name literally contains '%' may match.
		result.Data.Should().ContainSingle(u => u.FirstName == $"Has%Percent{marker}");
		result.Data.Should().NotContain(u => u.FirstName == $"NoPercentAtAll{marker}");
	}

	/// <summary>
	/// Regression for the front-2 step-4b review (BLOCKER 1): the tenant-users candidate
	/// list is shared by both the tenant Users page (which links via the global user id) and
	/// the Assign-members drawer (which must resolve/assign/unassign by user_account_id). The
	/// two ids are independent UUIDs — this pins that the response carries both, and that they
	/// are NOT equal for a genuine tenant member, so a caller can never mistake one for the
	/// other.
	/// </summary>
	[Fact]
	public async Task
	ItShouldExposeBothTheGlobalUserIdAndTheDistinctUserAccountId() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var marker = Guid.NewGuid().ToString("N")[..8];

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"Tenant Identity Fixture {marker}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		var user = new User {
			Email = $"tenant-identity-{marker}@example.com",
			Password = "unused",
			FirstName = "Identity",
			LastName = "Fixture",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();
		var userId = user.GetRequiredId();

		var account = UserAccount.CreateTenantAccount(userId, tenantId);
		await dbContext.UserAccount.AddAsync(account);
		await dbContext.SaveChangesAsync();
		var userAccountId = account.GetRequiredId();

		var url = GetFindUrl(tenantId);
		var request = new HttpRequestMessage(
			HttpMethod.Get, url
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var item = result.Data.Should()
			.ContainSingle(u => u.Id == userId.ToString())
			.Subject;

		item.UserAccountId.Should().Be(userAccountId.ToString());
		item.UserAccountId.Should().NotBe(item.Id);
	}

	private async Task<Guid> SeedTenantWithSearchFixtureAsync(string marker) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"Tenant Find Search Fixture {marker}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		async Task AddUserAsync(string firstName) {
			var user = new User {
				Email = $"tenant-find-search-{Guid.NewGuid():N}@example.com",
				Password = "unused",
				FirstName = firstName,
				LastName = "Search",
				Status = UserStatus.Active,
				IsVerified = true,
			};
			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			await dbContext.UserAccount.AddAsync(
				UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId)
			);
			await dbContext.SaveChangesAsync();
		}

		await AddUserAsync($"Has%Percent{marker}");
		await AddUserAsync($"NoPercentAtAll{marker}");

		return tenantId;
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
	ItShouldReturnOkWhenStatusIsWhitespace() {
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
			status: "%20"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWhenLevelIsWhitespace() {
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
			level: "%20"
		);
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);
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
				.GetRequiredService<AppDbContext>();

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
			acmeMembership.Status = AccountStatus.Suspended;
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
		Assert.NotNull(result);
		result.Data.Should().NotBeEmpty();
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
				.GetRequiredService<AppDbContext>();

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
			acmeMembership.Status = AccountStatus.Suspended;
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
		Assert.NotNull(result);
		result.Data.Should().Contain(user =>
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
			Assert.NotNull(result);
			result.Data.Should().Contain(user =>
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
			Assert.NotNull(result);
			result.Data.Should().Contain(user =>
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
			Assert.NotNull(activeResult);
			activeResult.Data.Should().NotContain(user =>
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
			Assert.NotNull(suspendedResult);
			suspendedResult.Data.Should().NotContain(user =>
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
			Assert.NotNull(result);
			result.Data.Should().NotBeEmpty();
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

				userStatus: UserStatus.Active
			);
		}
	}

	[Fact]
	public async Task
	ItShouldFilterTenantUsersByAdminLevel() {
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
			level: "admin"
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
		Assert.NotNull(result);
		result.Data.Should().NotBeEmpty();
		result.Data.Should().OnlyContain(user => user.Level == "Admin");
		result.Data.Select(user => user.Email)
			.Should()
			.Contain(SeedConstants.Tenants.AcmeAdminEmail);
	}

	[Fact]
	public async Task
	ItShouldFilterTenantUsersByUserLevel() {
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
			level: "user"
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
		Assert.NotNull(result);
		result.Data.Should().NotBeEmpty();
		result.Data.Should().OnlyContain(user => user.Level == "User");
		result.Data.Select(user => user.Email)
			.Should()
			.Contain(SeedConstants.Tenants.AcmeUserEmail);
	}

	[Fact]
	public async Task
	ItShouldFilterTenantUsersByMultipleLevelsWhenCommaSeparated() {
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
			level: "admin,user"
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
		Assert.NotNull(result);
		result.Data.Select(user => user.Level)
			.Should()
			.Contain("Admin");
		result.Data.Select(user => user.Level)
			.Should()
			.Contain("User");
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenLevelIsInvalid() {
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
			level: "owner"
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
		Assert.NotNull(result);
		result.Data.Should().NotBeEmpty();
	}

	// -- URL builder --

	private static string GetFindUrl(
		Guid tenantId,
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? status = null,
		string? level = null,
		string? search = null
	) {
		return GetFindUrl(
			tenantId.ToString(),
			cursor,
			limit,
			sortId,
			sortOrder,
			status,
			level,
			search
		);
	}

	private static string GetFindUrl(
		string tenantId,
		string? cursor = null,
		int? limit = null,
		string? sortId = null,
		string? sortOrder = null,
		string? status = null,
		string? level = null,
		string? search = null
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
		if (level is not null) {
			queryParams.Add($"level={level}");
		}
		if (search is not null) {
			queryParams.Add($"q={Uri.EscapeDataString(search)}");
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
		UserStatus userStatus
	) {
		using var scope =
			_fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var membership = await dbContext.UserAccount
			.FirstAsync(ua =>
				ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.User.Email == email
			);
		var user = await dbContext.User
			.FirstAsync(u => u.Email == email);

		membership.Status = isMembershipSuspended ? AccountStatus.Suspended : AccountStatus.Active;
		user.Status = userStatus;

		await dbContext.SaveChangesAsync();
	}

	[Fact]
	public async Task
	ItShouldWalkEveryCreatedAtPageWithoutOverlapOrGap() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		// 3 users with distinct account CreatedAt; the walk must visit each
		// once in ascending CreatedAt order, with no gap or duplicate.
		var baseDate = new DateTime(
			2026, 1, 1, 0, 0, 0, DateTimeKind.Utc
		);
		// The sort key for created_at is User.CreatedAt (see
		// TenantUserQueryService). Seed it deliberately NOT insertion-ordered
		// (anti-correlated) so the walk order pins User.CreatedAt and not the
		// insert-order of the account/user rows.
		var seededIds = new List<string>();
		var seededUserIds = new List<Guid>();
		var seededOrder = new List<DateTime>();
		for (var i = 0; i < 3; i++) {
			// Two rows share the same CreatedAt (i=0 and i=2), one has a
			// different value (i=1). The tiebreaker (Id ascending) must
			// determine the order of the two equal-key rows.
			var createdAt = i == 1 ? baseDate.AddDays(1) : baseDate;
			var userId = await SeedTenantUserAtAsync(tenantId, createdAt);
			seededIds.Add(userId);
			seededUserIds.Add(Guid.Parse(userId));
			seededOrder.Add(createdAt);
		}

			// Swap the IDs of the two equal-key rows (i=0 and i=2) so the row
			// inserted at i=2 has the smaller Id. Without this, UUID v7 IDs are
			// insertion-ordered, so stable OrderBy(CreatedAt) already matches
			// ThenBy(Id) and removing the production tiebreaker leaves the test
			// green. After the swap, the tiebreaker is actually exercised.
			await SwapTenantUserIdsAsync(seededIds[0], seededIds[2]);
			(seededIds[0], seededIds[2]) = (seededIds[2], seededIds[0]);

		var visitedIds = new List<string>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				tenantId,
				cursor: cursor,
				limit: 1,
				sortId: "created_at",
				sortOrder: "asc"
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var page =
				await response.Content
					.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(
				page.Data.Select(u => u.Id)
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
			seededIds.OrderBy(id => createdAtById[id]).ThenBy(id => Guid.Parse(id)).ToList()
		);

		// Assert the OBSERVED sort order against the real User.CreatedAt values
		// from the DB, in walk order. This pins the sort to User.CreatedAt and
		// catches a keySelector swap to another same-type field.
		var visitedSeededUserIds = visitedOrder
			.Select(Guid.Parse)
			.ToList();
		List<DateTime> observedOrder;
		{
			await using var scope =
				_fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			observedOrder = await dbContext.User
				.Where(u => visitedSeededUserIds.Contains((Guid)u.Id!))
				.OrderBy(u => visitedSeededUserIds.IndexOf((Guid)u.Id!))
				.Select(u => u.CreatedAt)
				.ToListAsync();
		}
		observedOrder.Should().Equal(seededOrder.OrderBy(x => x).ToList());
		observedOrder.Should().NotEqual(seededOrder);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryIdPageWithoutOverlapOrGap() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		// 3 users with distinct UserId; the walk must visit each once in
		// ascending UserId order. A keySelector swap to another same-type field
		// (e.g. User.Email) turns this assertion RED.
		var seededIds = new List<string>();
		for (var i = 0; i < 3; i++) {
			var userId = await SeedTenantUserAtAsync(
				tenantId,
				new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddDays(i)
			);
			seededIds.Add(userId);
		}

		var visitedIds = new List<string>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				tenantId,
				cursor: cursor,
				limit: 1,
				sortId: "id",
				sortOrder: "asc"
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var page =
				await response.Content
					.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(
				page.Data.Select(u => u.Id)
			);
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var expectedOrder = seededIds
			.OrderBy(id => Guid.Parse(id))
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryEmailPageWithoutOverlapOrGap() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		// Deterministic, anti-correlated emails: insertion order is c,b,a while
		// the lexical (sort) order is a,b,c. The walk must return them in
		// lexical order, so a keySelector swap to the id (insertion) order
		// turns this assertion RED.
		var seededIds = new List<string>();
		var seededEmails = new List<string>();
		var emails = new[] { "charlie", "alpha", "bravo" };
		for (var i = 0; i < 3; i++) {
			var email = $"{emails[i]}-walk-{Guid.NewGuid():N}@example.com";
			var userId = await SeedTenantUserWithEmailAsync(tenantId, email);
			seededIds.Add(userId);
			seededEmails.Add(email);
		}
		var expectedOrder = seededIds
			.Zip(seededEmails, (id, e) => (id, e))
			.OrderBy(x => x.e, StringComparer.OrdinalIgnoreCase)
			.Select(x => x.id)
			.ToList();

		var visitedIds = new List<string>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				tenantId,
				cursor: cursor,
				limit: 1,
				sortId: "email",
				sortOrder: "asc"
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var page =
				await response.Content
					.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(
				page.Data.Select(u => u.Id)
			);
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryStatusPageWithoutOverlapOrGap() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		// 3 users with distinct, deliberately NOT insertion-ordered Status
		// (anti-correlated with insertion). The walk must visit each once in
		// ascending Status order. A keySelector swap to another same-type field
		// (e.g. Level) turns this assertion RED.
		// UserStatus: Suspended = 30, Active = 40.
		// The production key selector maps: User.Status==Suspended -> 2,
		// Account.Status==Suspended -> 1, else -> 0. So the seeded statuses
		// {Suspended, Active, Suspended} map to keys {2, 0, 2}.
		var statuses = new[] { UserStatus.Suspended, UserStatus.Active, UserStatus.Suspended };
		var seededIds = new List<string>();
		for (var i = 0; i < 3; i++) {
			var userId = await SeedTenantUserAtAsync(
				tenantId,
				new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddDays(i)
			);
			await SetTenantUserStatusAsync(Guid.Parse(userId), statuses[i]);
			seededIds.Add(userId);
		}

		var visitedIds = new List<string>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				tenantId,
				cursor: cursor,
				limit: 1,
				sortId: "status",
				sortOrder: "asc"
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var page =
				await response.Content
					.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(
				page.Data.Select(u => u.Id)
			);
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		// Production orders by the key selector value ascending, then by Id ascending.
		// Key selector: User.Status==Suspended -> 2, Account.Status==Suspended -> 1, else -> 0.
		// Seeded statuses {Suspended, Active, Suspended} map to keys {2, 0, 2}.
		var expectedOrder = seededIds
			.Zip(statuses, (id, s) => (id, key: s == UserStatus.Suspended ? 2 : 0))
			.OrderBy(x => x.key)
			.ThenBy(x => Guid.Parse(x.id))
			.Select(x => x.id)
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	[Fact]
	public async Task
	ItShouldWalkEveryLevelPageWithoutOverlapOrGap() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var tenantId =
			await TenantTestHelper
				.GetTenantIdByNameAsync(
					_http,
					staffToken,
					SeedConstants.Tenants.AcmeName
				);

		// 3 users with distinct, deliberately NOT insertion-ordered Level
		// (anti-correlated with insertion). The walk must visit each once in
		// ascending Level order. A keySelector swap to another same-type field
		// (e.g. Status) turns this assertion RED.
		// AccountLevel: User = 10, Admin = 50.
		var levels = new[] { AccountLevel.Admin, AccountLevel.User, AccountLevel.Admin };
		var seededIds = new List<string>();
		for (var i = 0; i < 3; i++) {
			var userId = await SeedTenantUserAtAsync(
				tenantId,
				new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddDays(i)
			);
			await SetTenantUserLevelAsync(Guid.Parse(userId), levels[i]);
			seededIds.Add(userId);
		}

		var visitedIds = new List<string>();
		string? cursor = null;
		var pages = 0;
		do {
			var url = GetFindUrl(
				tenantId,
				cursor: cursor,
				limit: 1,
				sortId: "level",
				sortOrder: "asc"
			);
			var request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using var response =
				await _http.SendAsync(request);
			response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			var page =
				await response.Content
					.ReadFromJsonAsync<FindResponse>();
			page.Should().NotBeNull();
			Assert.NotNull(page);
			pages++;
			visitedIds.AddRange(
				page.Data.Select(u => u.Id)
			);
			cursor = page.NextCursor;

			pages.Should().BeLessOrEqualTo(100);
		} while (cursor is not null);

		visitedIds.Should().OnlyHaveUniqueItems();
		visitedIds.Should().Contain(seededIds);

		var visitedOrder = visitedIds
			.Where(seededIds.Contains)
			.ToList();
		var expectedOrder = seededIds
			.Zip(levels, (id, l) => (id, l))
			.OrderBy(x => x.l)
			.ThenBy(x => Guid.Parse(x.id))
			.Select(x => x.id)
			.ToList();
		visitedOrder.Should().Equal(expectedOrder);
	}

	private async Task<string> SeedTenantUserWithEmailAsync(
		Guid tenantId,
		string email
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = "unused",
			FirstName = "Walk",
			LastName = "Fixture",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();
		var userId = user.GetRequiredId();

		var account =
			UserAccount.CreateTenantAccount(userId, tenantId);
		await dbContext.UserAccount.AddAsync(account);
		await dbContext.SaveChangesAsync();

		return userId.ToString();
	}

	private async Task SetTenantUserStatusAsync(Guid userId, UserStatus status) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.FirstAsync(u => u.Id == userId);
		user.Status = status;

		await dbContext.SaveChangesAsync();
	}

	private async Task SetTenantUserLevelAsync(Guid userId, AccountLevel level) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var account = await dbContext.UserAccount
			.FirstAsync(ua =>
				ua.UserId == userId && ua.Scope == AccountScope.Tenant
			);
		account.Level = level;

		await dbContext.SaveChangesAsync();
	}

	private async Task<string> SeedTenantUserAtAsync(
		Guid tenantId,
		DateTime createdAt
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = $"tenant-user-walk-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			FirstName = "Walk",
			LastName = "Fixture",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		// Sort key is User.CreatedAt: pin it on the User via two-phase save
		// (insert stamps now; re-save Modified only updates UpdatedAt).
		await dbContext.User.AddAsync(user);
		await dbContext.SaveChangesAsync();
		var userId = user.GetRequiredId();

		var trackedUser = await dbContext.User
			.Where(u => u.Id == userId)
			.FirstAsync();
		trackedUser.CreatedAt = createdAt;
		await dbContext.SaveChangesAsync();

		var account =
			UserAccount.CreateTenantAccount(userId, tenantId);
		await dbContext.UserAccount.AddAsync(account);
		await dbContext.SaveChangesAsync();

		return userId.ToString();
	}

	// -- Response DTOs --

	private record FindResponse {
		public List<TenantUserItemDto> Data { get; init; }
			= [];
		public string? NextCursor { get; init; }
	}

	private record TenantUserItemDto {
		public string Id { get; init; } = string.Empty;
		public string UserAccountId { get; init; } = string.Empty;
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

	private async Task SwapTenantUserIdsAsync(string idA, string idB) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var temp = Guid.NewGuid();
		var guidA = Guid.Parse(idA);
		var guidB = Guid.Parse(idB);
		// Swap IDs on both the parent (users) and child (user_accounts)
		// tables. The three-step swap via temp avoids PK collision, and updating
		// the child table avoids FK violation (FK is not DEFERRABLE).
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE user_accounts SET user_id = {0} WHERE user_id = {1}",
			temp, guidA);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE users SET id = {0} WHERE id = {1}",
			temp, guidA);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE user_accounts SET user_id = {0} WHERE user_id = {1}",
			guidA, guidB);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE users SET id = {0} WHERE id = {1}",
			guidA, guidB);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE user_accounts SET user_id = {0} WHERE user_id = {1}",
			guidB, temp);
		await dbContext.Database.ExecuteSqlRawAsync(
			"UPDATE users SET id = {0} WHERE id = {1}",
			guidB, temp);
	}
}
