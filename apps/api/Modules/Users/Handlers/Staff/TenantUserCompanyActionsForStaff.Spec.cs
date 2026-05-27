
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Lib.Utils;
using MainApi.Modules.Profiles.Entities;
using MainApi.Modules.Tenants.Entities;
using MainApi.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Modules.Users.Handlers.Staff;
public sealed class TenantUserCompanyActionsForStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantUserCompanyActionsForStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldAssignTenantUserToNewAndPreviouslyRemovedCompanies() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserCompanyScenarioAsync();

		using var response = await _http.SendAsync(
			CreateJsonRequest(
				HttpMethod.Post,
				GetCompaniesUrl(seeded.UserId),
				staffToken,
				new {
					tenantIds = new[] {
						seeded.NewTenantId,
						seeded.RemovedTenantId,
					},
					level = "User",
				}
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<TenantUserCompanyBulkActionResponse>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant user company assign response was empty."
			);
		}
		result.SucceededCount.Should().Be(
			2,
			"failed items: {0}",
			string.Join(
				", ",
				result.FailedItems.Select(item =>
					$"{item.TenantId}:{item.Error}"
				)
			)
		);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertTenantMembershipAsync(
			seeded.UserId,
			seeded.NewTenantId,
			AccountStatus.Active,
			AccountLevel.User
		);
		await AssertTenantMembershipAsync(
			seeded.UserId,
			seeded.RemovedTenantId,
			AccountStatus.Active,
			AccountLevel.User
		);
		await AssertDefaultProfileAssignedAsync(
			seeded.UserId,
			seeded.NewTenantId
		);
		await AssertDefaultProfileAssignedAsync(
			seeded.UserId,
			seeded.RemovedTenantId
		);
		await AssertOnlyDefaultProfileAssignedAsync(
			seeded.UserId,
			seeded.RemovedTenantId
		);
	}

	[Fact]
	public async Task
	ItShouldBulkSuspendAndReactivateTenantUserCompanies() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserCompanyScenarioAsync();

		using var suspendResponse = await _http.SendAsync(
			CreateJsonRequest(
				HttpMethod.Post,
				GetBulkSuspendUrl(seeded.UserId),
				staffToken,
				new {
					tenantIds = new[] {
						seeded.PrimaryTenantId,
						seeded.SecondaryTenantId,
					},
				}
			)
		);

		suspendResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var suspendResult = await suspendResponse.Content
			.ReadFromJsonAsync<TenantUserCompanyBulkActionResponse>();
		suspendResult.Should().NotBeNull();
		if (suspendResult is null) {
			throw new InvalidOperationException(
				"Tenant user company bulk suspend response was empty."
			);
		}
		suspendResult.SucceededCount.Should().Be(2);
		suspendResult.FailedCount.Should().Be(0);

		await AssertTenantMembershipAsync(
			seeded.UserId,
			seeded.PrimaryTenantId,
			AccountStatus.Suspended,
			AccountLevel.User
		);
		await AssertTenantMembershipAsync(
			seeded.UserId,
			seeded.SecondaryTenantId,
			AccountStatus.Suspended,
			AccountLevel.User
		);

		using var reactivateResponse = await _http.SendAsync(
			CreateJsonRequest(
				HttpMethod.Post,
				GetBulkReactivateUrl(seeded.UserId),
				staffToken,
				new {
					tenantIds = new[] {
						seeded.PrimaryTenantId,
						seeded.SecondaryTenantId,
					},
				}
			)
		);

		reactivateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var reactivateResult = await reactivateResponse.Content
			.ReadFromJsonAsync<TenantUserCompanyBulkActionResponse>();
		reactivateResult.Should().NotBeNull();
		if (reactivateResult is null) {
			throw new InvalidOperationException(
				"Tenant user company bulk reactivate response was empty."
			);
		}
		reactivateResult.SucceededCount.Should().Be(2);
		reactivateResult.FailedCount.Should().Be(0);

		await AssertTenantMembershipAsync(
			seeded.UserId,
			seeded.PrimaryTenantId,
			AccountStatus.Active,
			AccountLevel.User
		);
		await AssertTenantMembershipAsync(
			seeded.UserId,
			seeded.SecondaryTenantId,
			AccountStatus.Active,
			AccountLevel.User
		);
	}

	[Fact]
	public async Task
	ItShouldBulkRemoveTenantUserCompaniesWithoutDeletingTenantUserIdentity() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserCompanyScenarioAsync();

		using var response = await _http.SendAsync(
			CreateJsonRequest(
				HttpMethod.Post,
				GetBulkRemoveUrl(seeded.UserId),
				staffToken,
				new {
					tenantIds = new[] {
						seeded.PrimaryTenantId,
						seeded.SecondaryTenantId,
					},
				}
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<TenantUserCompanyBulkActionResponse>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant user company bulk remove response was empty."
			);
		}
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);

		await AssertTenantMembershipRemovedAsync(
			seeded.UserId,
			seeded.PrimaryTenantId
		);
		await AssertTenantMembershipRemovedAsync(
			seeded.UserId,
			seeded.SecondaryTenantId
		);

		using var detailsResponse = await _http.SendAsync(
			CreateRequest(
				HttpMethod.Get,
				GetTenantUserUrl(seeded.UserId),
				staffToken
			)
		);
		detailsResponse.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Theory]
	[InlineData("""{}""")]
	[InlineData("""{ "tenantIds": [] }""")]
	[InlineData("""{ "tenantIds": ["not-a-guid"] }""")]
	public async Task
	ItShouldReturnValidationProblemForInvalidBulkTenantIds(
		string body
	) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserCompanyScenarioAsync();

		using var response = await _http.SendAsync(
			CreateRawJsonRequest(
				HttpMethod.Post,
				GetBulkRemoveUrl(seeded.UserId),
				staffToken,
				body
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Theory]
	[InlineData("""{ "tenantIds": ["019e00f1-fdc4-7eb5-adb4-7d91dee9f9e8"] }""")]
	[InlineData("""
		{
			"tenantIds": ["019e00f1-fdc4-7eb5-adb4-7d91dee9f9e8"],
			"level": "Owner"
		}
		""")]
	public async Task
	ItShouldReturnValidationProblemForInvalidAssignCompanyBody(
		string body
	) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserCompanyScenarioAsync();

		using var response = await _http.SendAsync(
			CreateRawJsonRequest(
				HttpMethod.Post,
				GetCompaniesUrl(seeded.UserId),
				staffToken,
				body
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnValidationProblemWhenBulkCompanyRequestExceedsMaximum() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserCompanyScenarioAsync();
		var tenantIds = Enumerable
			.Range(0, 101)
			.Select(_ => $"\"{Guid.NewGuid()}\"");
		var body = $$"""
			{
				"tenantIds": [{{string.Join(",", tenantIds)}}]
			}
			""";

		using var response = await _http.SendAsync(
			CreateRawJsonRequest(
				HttpMethod.Post,
				GetBulkSuspendUrl(seeded.UserId),
				staffToken,
				body
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Theory]
	[InlineData("assign")]
	[InlineData("bulk-remove")]
	[InlineData("bulk-suspend")]
	[InlineData("bulk-reactivate")]
	public async Task
	ItShouldReturnBadRequestWhenCompanyActionUserIdIsMalformed(string action) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			CreateJsonRequest(
				HttpMethod.Post,
				GetCompanyActionUrl(action, "not-a-guid"),
				staffToken,
				CreateValidCompanyActionBody(action, Guid.NewGuid())
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Theory]
	[InlineData("assign")]
	[InlineData("bulk-remove")]
	[InlineData("bulk-suspend")]
	[InlineData("bulk-reactivate")]
	public async Task
	ItShouldReturnNotFoundWhenCompanyActionTenantUserDoesNotExist(
		string action
	) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await _http.SendAsync(
			CreateJsonRequest(
				HttpMethod.Post,
				GetCompanyActionUrl(action, Guid.NewGuid().ToString()),
				staffToken,
				CreateValidCompanyActionBody(action, Guid.NewGuid())
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task
	ItShouldReturnPartialFailuresWhenAssigningExistingAndMissingCompanies() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var seeded = await SeedTenantUserCompanyScenarioAsync();
		var missingTenantId = Guid.NewGuid();

		using var response = await _http.SendAsync(
			CreateJsonRequest(
				HttpMethod.Post,
				GetCompaniesUrl(seeded.UserId),
				staffToken,
				new {
					tenantIds = new[] {
						seeded.PrimaryTenantId,
						seeded.NewTenantId,
						missingTenantId,
					},
					level = "Admin",
				}
			)
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<TenantUserCompanyBulkActionResponse>();
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant user company assign response was empty."
			);
		}
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().Contain(item =>
			item.TenantId == seeded.PrimaryTenantId
			&& item.Error == "Already assigned"
		);
		result.FailedItems.Should().Contain(item =>
			item.TenantId == missingTenantId
			&& item.Error == "Tenant not found"
		);

		await AssertTenantMembershipAsync(
			seeded.UserId,
			seeded.NewTenantId,
			AccountStatus.Active,
			AccountLevel.Admin
		);
	}

	private async Task<SeededTenantUserCompanyScenario>
	SeedTenantUserCompanyScenarioAsync() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var unique = Guid.NewGuid().ToString("N");
		var user = new User {
			Email = $"tenant-user-company-actions-{unique}@example.com",
			Password = "unused",
			FirstName = "Tenant",
			LastName = "Company Actions",
			Status = UserStatus.Active,
			IsVerified = true,
		};

		var primaryTenant = CreateTenant($"Actions Primary {unique}");
		var secondaryTenant = CreateTenant($"Actions Secondary {unique}");
		var newTenant = CreateTenant($"Actions New {unique}");
		var removedTenant = CreateTenant($"Actions Removed {unique}");

		await dbContext.User.AddAsync(user);
		await dbContext.Tenant.AddRangeAsync(
			primaryTenant,
			secondaryTenant,
			newTenant,
			removedTenant
		);
		await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var primaryTenantId = primaryTenant.GetRequiredId();
		var secondaryTenantId = secondaryTenant.GetRequiredId();
		var removedTenantId = removedTenant.GetRequiredId();

		var accounts = new[] {
			UserAccount.CreateTenantAccount(
				userId,
				primaryTenantId,
				AccountLevel.User
			),
			UserAccount.CreateTenantAccount(
				userId,
				secondaryTenantId,
				AccountLevel.User
			),
			UserAccount.CreateTenantAccount(
				userId,
				removedTenantId,
				AccountLevel.Admin
			),
		};

		await dbContext.UserAccount.AddRangeAsync(accounts);
		await dbContext.SaveChangesAsync();

		var staleProfile = Profile.CreateTenantProfile(
			removedTenantId,
			$"Actions Stale Profile {unique}"
		);
		await dbContext.Profile.AddAsync(staleProfile);
		await dbContext.SaveChangesAsync();
		// Reassignment must not resurrect this stale link; the service should
		// purge old membership profile links before assigning the default profile.
		await dbContext.UserAccountProfile.AddAsync(
			new UserAccountProfile {
				UserAccountId = accounts[^1].GetRequiredId(),
				ProfileId = staleProfile.GetRequiredId(),
			}
		);

		accounts[^1].Status = AccountStatus.Suspended;
		accounts[^1].IsDeleted = true;
		accounts[^1].DeletedAt = DateTime.UtcNow;
		await dbContext.SaveChangesAsync();

		return new SeededTenantUserCompanyScenario(
			UserId: userId,
			PrimaryTenantId: primaryTenantId,
			SecondaryTenantId: secondaryTenantId,
			NewTenantId: newTenant.GetRequiredId(),
			RemovedTenantId: removedTenantId
		);
	}

	private static Tenant CreateTenant(string name) {
		return new Tenant {
			Name = name,
			Code = Guid.NewGuid().ToString("N")[..12],
			Status = TenantStatus.Active,
			MaxUsers = 100,
		};
	}

	private async Task AssertTenantMembershipAsync(
		Guid userId,
		Guid tenantId,
		AccountStatus expectedStatus,
		AccountLevel expectedLevel
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var account = await FindTenantMembershipAsync(
			dbContext,
			userId,
			tenantId
		);

		account.Should().NotBeNull();
		if (account is null) {
			throw new InvalidOperationException(
				"Expected tenant membership was not found."
			);
		}
		account.IsDeleted.Should().BeFalse();
		account.DeletedAt.Should().BeNull();
		account.Status.Should().Be(expectedStatus);
		account.Level.Should().Be(expectedLevel);
	}

	private async Task AssertTenantMembershipRemovedAsync(
		Guid userId,
		Guid tenantId
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var account = await FindTenantMembershipAsync(
			dbContext,
			userId,
			tenantId
		);

		account.Should().NotBeNull();
		if (account is null) {
			throw new InvalidOperationException(
				"Expected removed tenant membership was not found."
			);
		}
		account.IsDeleted.Should().BeTrue();
		account.DeletedAt.Should().NotBeNull();
	}

	private async Task AssertDefaultProfileAssignedAsync(
		Guid userId,
		Guid tenantId
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var query =
			from account in dbContext.UserAccount.IgnoreQueryFilters()
			join link in dbContext.UserAccountProfile
				on account.Id equals link.UserAccountId
			join profile in dbContext.Profile.IgnoreQueryFilters()
				on link.ProfileId equals profile.Id
			where account.UserId == userId
				&& account.TenantId == tenantId
				&& account.Scope == AccountScope.Tenant
				&& !account.IsDeleted
				&& profile.Scope == ProfileScope.Tenant
				&& profile.TenantId == tenantId
				&& profile.IsDefault
				&& !profile.IsDeleted
			select link;

		var hasDefaultProfile = await query.AnyAsync();
		hasDefaultProfile.Should().BeTrue();
	}

	private async Task AssertOnlyDefaultProfileAssignedAsync(
		Guid userId,
		Guid tenantId
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var profiles = await (
			from account in dbContext.UserAccount.IgnoreQueryFilters()
			join link in dbContext.UserAccountProfile
				on account.Id equals link.UserAccountId
			join profile in dbContext.Profile.IgnoreQueryFilters()
				on link.ProfileId equals profile.Id
			where account.UserId == userId
				&& account.TenantId == tenantId
				&& account.Scope == AccountScope.Tenant
				&& !account.IsDeleted
				&& profile.Scope == ProfileScope.Tenant
				&& profile.TenantId == tenantId
				&& !profile.IsDeleted
			select profile
		).ToListAsync();

		profiles.Should().ContainSingle();
		profiles[0].IsDefault.Should().BeTrue();
	}

	private static async Task<UserAccount?> FindTenantMembershipAsync(
		MainApiDbContext dbContext,
		Guid userId,
		Guid tenantId
	) {
		var query =
			from account in dbContext.UserAccount.IgnoreQueryFilters()
			where account.UserId == userId
				&& account.TenantId == tenantId
				&& account.Scope == AccountScope.Tenant
			select account;

		return await query.FirstOrDefaultAsync();
	}

	private static HttpRequestMessage CreateJsonRequest(
		HttpMethod method,
		string url,
		string sessionToken,
		object body
	) {
		var request = CreateRequest(method, url, sessionToken);
		request.Content = JsonContent.Create(body);

		return request;
	}

	private static HttpRequestMessage CreateRawJsonRequest(
		HttpMethod method,
		string url,
		string sessionToken,
		string body
	) {
		var request = CreateRequest(method, url, sessionToken);
		request.Content = new StringContent(
			body,
			System.Text.Encoding.UTF8,
			"application/json"
		);

		return request;
	}

	private static HttpRequestMessage CreateRequest(
		HttpMethod method,
		string url,
		string sessionToken
	) {
		return new HttpRequestMessage(
			method,
			url
		).WithSessionToken(sessionToken);
	}

	private static string GetTenantUserUrl(Guid userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			$"/tenant-users/{userId}"
		);
	}

	private static string GetCompaniesUrl(Guid userId) {
		return GetCompaniesUrl(userId.ToString());
	}

	private static string GetCompaniesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			$"/tenant-users/{userId}/companies"
		);
	}

	private static string GetBulkSuspendUrl(Guid userId) {
		return GetBulkSuspendUrl(userId.ToString());
	}

	private static string GetBulkSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			$"/tenant-users/{userId}/companies/bulk-suspend"
		);
	}

	private static string GetBulkReactivateUrl(Guid userId) {
		return GetBulkReactivateUrl(userId.ToString());
	}

	private static string GetBulkReactivateUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			$"/tenant-users/{userId}/companies/bulk-reactivate"
		);
	}

	private static string GetBulkRemoveUrl(Guid userId) {
		return GetBulkRemoveUrl(userId.ToString());
	}

	private static string GetBulkRemoveUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			$"/tenant-users/{userId}/companies/bulk-remove"
		);
	}

	private static string GetCompanyActionUrl(
		string action,
		string userId
	) {
		if (action == "assign") {
			return GetCompaniesUrl(userId);
		}
		if (action == "bulk-remove") {
			return GetBulkRemoveUrl(userId);
		}
		if (action == "bulk-suspend") {
			return GetBulkSuspendUrl(userId);
		}
		if (action == "bulk-reactivate") {
			return GetBulkReactivateUrl(userId);
		}

		throw new InvalidOperationException(
			$"Unsupported company action '{action}'."
		);
	}

	private static object CreateValidCompanyActionBody(
		string action,
		Guid tenantId
	) {
		if (action == "assign") {
			return new {
				tenantIds = new[] { tenantId },
				level = "User",
			};
		}

		return new { tenantIds = new[] { tenantId } };
	}

	private sealed record SeededTenantUserCompanyScenario(
		Guid UserId,
		Guid PrimaryTenantId,
		Guid SecondaryTenantId,
		Guid NewTenantId,
		Guid RemovedTenantId
	);

	private sealed record TenantUserCompanyBulkActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public List<TenantUserCompanyFailedItemResponse> FailedItems { get; init; } = [];
	}

	private sealed record TenantUserCompanyFailedItemResponse {
		public Guid TenantId { get; init; }
		public string Error { get; init; } = string.Empty;
	}
}
