namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Profiles.Services;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Tenants.Handlers.Staff;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class BulkDeleteTenantProfilesAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkDeleteTenantProfilesAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetCreateProfileUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Create
		);
	}

	private static string GetBulkDeleteUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.BulkDelete
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkDeleteAsync(
			sessionToken: null,
			tenantId.ToString(),
			new { profileIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForInvalidSession() {
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkDeleteAsync(
			"invalid-session-token",
			tenantId.ToString(),
			new { profileIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkDeleteAsync(
			tenantToken,
			tenantId.ToString(),
			new { profileIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithoutPermissionAsync(
				_fixture,
				_authClient,
				"bulk-delete-tenant-profile-no-permission"
			);
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { profileIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldAllowPermissionedStaffUserToBulkDeleteTenantProfiles() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithPermissionAsync(
				_fixture,
				_authClient,
				"bulk-delete-tenant-profile-permissioned",
				AppPermissions.Staff.Profiles.DELETE_FOR_TENANT.Key
			);
		var tenantId = await GetTenantIdAsync();
		var profileId = await SeedTenantProfileAsync(tenantId);

		using var response = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { profileIds = new[] { profileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await BulkDeleteAsync(
			staffToken,
			"not-a-guid",
			new { profileIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedProfileIds() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { profileIds = new[] { "not-a-guid" } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Keys.Should().Contain("ProfileIds");
	}

	[Theory]
	[MemberData(nameof(InvalidBodies))]
	public async Task ItShouldReturnValidationProblemWhenBodyIsInvalid(string body) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var response = await BulkDeleteRawJsonAsync(
			staffToken,
			tenantId.ToString(),
			body
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Keys.Should().Contain("ProfileIds");
	}

	[Fact]
	public async Task ItShouldAcceptMaximumProfileIdsBoundary() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var body =
			$$"""{ "profileIds": [{{CreateProfileIdsJson(count: 100)}}] }""";

		using var response = await BulkDeleteRawJsonAsync(
			staffToken,
			tenantId.ToString(),
			body
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(100);
		result.FailedItems.Should().HaveCount(100);
	}

	[Fact]
	public async Task ItShouldDeleteTenantProfilesInOneBulkRequest() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var firstProfileId = await CreateTenantProfileAsync(staffToken, tenantId);
		var secondProfileId = await CreateTenantProfileAsync(staffToken, tenantId);
		await AttachTenantProfileRelationsAsync(tenantId, firstProfileId);
		await AttachTenantProfileRelationsAsync(tenantId, secondProfileId);
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { profileIds = new[] { firstProfileId, secondProfileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertTenantProfileDeletedAsync(tenantId, firstProfileId);
		await AssertTenantProfileDeletedAsync(tenantId, secondProfileId);
		await AssertProfileRelationsRemovedAsync(firstProfileId);
		await AssertProfileRelationsRemovedAsync(secondProfileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 2,
			expectedFailedCount: 0,
			expectedProfileIds: [firstProfileId, secondProfileId]
		);
	}

	[Fact]
	public async Task ItShouldDeduplicateRepeatedTenantProfileIdsBeforeDeleting() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateTenantProfileAsync(staffToken, tenantId);
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { profileIds = new[] { profileId, profileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertTenantProfileDeletedAsync(tenantId, profileId);
		await AssertProfileRelationsRemovedAsync(profileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 1,
			expectedFailedCount: 0,
			expectedProfileIds: [profileId]
		);
	}

	[Fact]
	public async Task ItShouldReturnPartialResultForDefaultAndMissingProfiles() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var deletableProfileId = await CreateTenantProfileAsync(staffToken, tenantId);
		var defaultProfileId = await GetDefaultTenantProfileIdAsync(tenantId);
		var missingProfileId = Guid.NewGuid();
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new {
				profileIds = new[] {
					deletableProfileId,
					defaultProfileId,
					missingProfileId
				}
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == defaultProfileId
			&& item.Error == "Default tenant profile cannot be deleted"
		);
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == missingProfileId
			&& item.Error == "Profile not found"
		);

		await AssertTenantProfileDeletedAsync(tenantId, deletableProfileId);
		await AssertTenantProfileNotDeletedAsync(tenantId, defaultProfileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 3,
			expectedSucceededCount: 1,
			expectedFailedCount: 2,
			expectedProfileIds: [
				deletableProfileId,
				defaultProfileId,
				missingProfileId
			],
			expectedFailedItems: new Dictionary<Guid, string> {
				[defaultProfileId] = "Default tenant profile cannot be deleted",
				[missingProfileId] = "Profile not found",
			}
		);
	}

	[Fact]
	public async Task ItShouldReportAlreadyDeletedTenantProfilesAsNotFound() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateTenantProfileAsync(staffToken, tenantId);

		using var firstResponse = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { profileIds = new[] { profileId } }
		);
		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var startedAt = DateTime.UtcNow;
		using var secondResponse = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { profileIds = new[] { profileId } }
		);

		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await secondResponse.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == profileId
			&& item.Error == "Profile not found"
		);

		await AssertTenantProfileDeletedAsync(tenantId, profileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 0,
			expectedFailedCount: 1,
			expectedProfileIds: [profileId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[profileId] = "Profile not found",
			}
		);
	}

	[Fact]
	public async Task ItShouldRejectProfilesFromAnotherTenant() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var otherTenant = await TenantBulkActionSpecSupport.SeedTenantAsync(
			_fixture,
			"Bulk Delete Other Tenant Profile",
			TenantStatus.Active
		);
		var otherTenantProfileId = await SeedTenantProfileAsync(otherTenant.TenantId);
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { profileIds = new[] { otherTenantProfileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == otherTenantProfileId
			&& item.Error == "Profile not found"
		);

		await AssertTenantProfileNotDeletedAsync(
			otherTenant.TenantId,
			otherTenantProfileId
		);
		await AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 0,
			expectedFailedCount: 1,
			expectedProfileIds: [otherTenantProfileId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[otherTenantProfileId] = "Profile not found",
			}
		);
	}

	public static IEnumerable<object[]> InvalidBodies() {
		yield return ["""{}"""];
		yield return ["""{ "profileIds": null }"""];
		yield return ["""{ "profileIds": "not-an-array" }"""];
		yield return ["""{ "profileIds": [null] }"""];
		yield return ["""{ "profileIds": [123] }"""];
		yield return ["""{ "profileIds": [{}] }"""];
		yield return ["""{ "profileIds": [] }"""];
		// The validator allows at most 100 profile IDs per bulk request.
		yield return [
			$$"""
			{
				"profileIds": [
					{{CreateProfileIdsJson(count: 101)}}
				]
			}
			"""
		];
	}

	private async Task<Guid> GetTenantIdAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> CreateTenantProfileAsync(
		string staffToken,
		Guid tenantId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateProfileUrl(tenantId.ToString())
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			name = "Bulk Delete Tenant Profile " + Guid.NewGuid().ToString("N")[..8],
			description = "Profile created for bulk delete tests"
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<TenantProfileResponse>();
		payload.Should().NotBeNull();
		return payload!.Profile.Id;
	}

	private async Task<Guid> SeedTenantProfileAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var profile = Profile.CreateTenantProfile(
			tenantId,
			"Cross Tenant Bulk Delete " + Guid.NewGuid().ToString("N")[..8]
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task AttachTenantProfileRelationsAsync(
		Guid tenantId,
		Guid profileId
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();
		var userAccountId = await GetTenantAccountIdByEmailAsync(
			dbContext,
			tenantId,
			TestConstants.AcmeAdminEmail
		);

		// Add both relation types so the successful bulk-delete path proves it cleans
		// joins in the same transaction as the profile soft delete.
		await dbContext.ProfilePermission.AddAsync(new ProfilePermission {
			ProfileId = profileId,
			PermissionKey = AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
		});
		await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
			UserAccountId = userAccountId,
			ProfileId = profileId,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task<Guid> GetDefaultTenantProfileIdAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var profileService =
			scope.ServiceProvider.GetRequiredService<IProfileAsStaffService>();
		var profile = await profileService.GetOrCreateDefaultTenantProfileAsync(tenantId);

		profile.Should().NotBeNull("the seeded tenant should have a default profile");
		if (profile is null) {
			throw new InvalidOperationException("Default tenant profile was not found.");
		}

		return profile.GetRequiredId();
	}

	private async Task<HttpResponseMessage> BulkDeleteAsync(
		string? sessionToken,
		string tenantId,
		object body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkDeleteUrl(tenantId)
		);

		if (sessionToken is not null) {
			request.WithSessionToken(sessionToken);
		}

		request.Content = JsonContent.Create(body);
		return await _http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> BulkDeleteRawJsonAsync(
		string sessionToken,
		string tenantId,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkDeleteUrl(tenantId)
		).WithSessionToken(sessionToken);

		request.Content = new StringContent(
			body,
			Encoding.UTF8,
			"application/json"
		);

		return await _http.SendAsync(request);
	}

	private async Task AssertTenantProfileDeletedAsync(
		Guid tenantId,
		Guid profileId
	) {
		var profile = await GetProfileIgnoringFiltersAsync(profileId);
		profile.Should().NotBeNull();
		if (profile is null) {
			throw new InvalidOperationException("Seeded profile could not be loaded.");
		}

		profile.TenantId.Should().Be(tenantId);
		profile.Scope.Should().Be(ProfileScope.Tenant);
		profile.IsDeleted.Should().BeTrue();
		profile.DeletedAt.Should().NotBeNull();
	}

	private async Task AssertTenantProfileNotDeletedAsync(
		Guid tenantId,
		Guid profileId
	) {
		var profile = await GetProfileIgnoringFiltersAsync(profileId);
		profile.Should().NotBeNull();
		if (profile is null) {
			throw new InvalidOperationException("Seeded profile could not be loaded.");
		}

		profile.TenantId.Should().Be(tenantId);
		profile.Scope.Should().Be(ProfileScope.Tenant);
		profile.IsDeleted.Should().BeFalse();
		profile.DeletedAt.Should().BeNull();
	}

	private async Task AssertProfileRelationsRemovedAsync(Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		// Joins are hard-deleted on profile removal, so ignore query filters to catch
		// both leftover active rows and accidental soft-deleted leftovers.
		var permissionCount = await (
			from permission in dbContext.ProfilePermission.IgnoreQueryFilters()
			where permission.ProfileId == profileId
			select permission
		).CountAsync();
		var userAccountProfileCount = await (
			from link in dbContext.UserAccountProfile.IgnoreQueryFilters()
			where link.ProfileId == profileId
			select link
		).CountAsync();

		permissionCount.Should().Be(0);
		userAccountProfileCount.Should().Be(0);
	}

	private async Task<Profile?> GetProfileIgnoringFiltersAsync(Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		return await (
			from profile in dbContext.Profile.IgnoreQueryFilters()
			where profile.Id == profileId
			select profile
		).FirstOrDefaultAsync();
	}

	private async Task AssertLatestBulkDeleteAuditLogAsync(
		Guid tenantId,
		DateTime startedAt,
		int expectedRequestedCount,
		int expectedSucceededCount,
		int expectedFailedCount,
		IReadOnlyCollection<Guid>? expectedProfileIds = null,
		IReadOnlyDictionary<Guid, string>? expectedFailedItems = null
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var auditLog = await (
			from log in dbContext.AuditLog
			where log.Action == AuditActions.TenantProfileBulkDeleted
				&& log.CreatedAt >= startedAt
			orderby log.CreatedAt descending
			select log
		).FirstOrDefaultAsync();

		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException("Bulk delete audit log was not written.");
		}

		var expectedUserId = await GetUserIdByEmailAsync(
			dbContext,
			TestConstants.StaffAdminEmail
		);
		auditLog.UserId.Should().Be(expectedUserId);
		auditLog.Details.Should().NotBeNull();
		using var document = JsonDocument.Parse(auditLog.Details!);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(tenantId);
		details.GetProperty("RequestedCount").GetInt32()
			.Should()
			.Be(expectedRequestedCount);
		details.GetProperty("SucceededCount").GetInt32()
			.Should()
			.Be(expectedSucceededCount);
		details.GetProperty("FailedCount").GetInt32()
			.Should()
			.Be(expectedFailedCount);

		if (expectedProfileIds is not null) {
			var actualProfileIds = details.GetProperty("ProfileIds")
				.EnumerateArray()
				.Select(item => item.GetGuid())
				.ToList();

			actualProfileIds.Should().Equal(expectedProfileIds);
		}

		if (expectedFailedItems is not null) {
			var actualFailedItems = details.GetProperty("FailedItems")
				.EnumerateArray()
				.ToDictionary(
					item => item.GetProperty("ProfileId").GetGuid(),
					item => item.GetProperty("Error").GetString() ?? string.Empty
				);

			actualFailedItems.Should().BeEquivalentTo(expectedFailedItems);
		}
	}

	private static async Task<Guid> GetTenantAccountIdByEmailAsync(
		MainApiDbContext dbContext,
		Guid tenantId,
		string email
	) {
		var accountId = await (
			from account in dbContext.UserAccount
			where account.User.Email == email
				&& account.TenantId == tenantId
				&& account.Scope == AccountScope.Tenant
				&& !account.IsDeleted
			select account.Id
		).FirstOrDefaultAsync();

		if (accountId is null) {
			throw new InvalidOperationException("Seeded tenant account was not found.");
		}

		return accountId.Value;
	}

	private static async Task<Guid> GetUserIdByEmailAsync(
		MainApiDbContext dbContext,
		string email
	) {
		var userId = await (
			from user in dbContext.User
			where user.Email == email
				&& !user.IsDeleted
			select user.Id
		).FirstOrDefaultAsync();

		if (userId is null) {
			throw new InvalidOperationException("Seeded user was not found.");
		}

		return userId.Value;
	}

	// Keep large body-shape cases generated locally so invalid/edge tests do not
	// need to seed a hundred database rows.
	private static string CreateProfileIdsJson(int count) {
		var builder = new StringBuilder();

		for (var i = 0; i < count; i++) {
			if (i > 0) {
				builder.Append(',');
			}

			builder.Append('"');
			builder.Append(Guid.NewGuid());
			builder.Append('"');
		}

		return builder.ToString();
	}

	private sealed record TenantProfileResponse {
		public required TenantProfileItemResponse Profile { get; init; }
	}

	private sealed record TenantProfileItemResponse {
		public Guid Id { get; init; }
	}

	private sealed record BulkProfileActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public required List<BulkProfileActionFailedItemResponse> FailedItems {
			get;
			init;
		}
	}

	private sealed record BulkProfileActionFailedItemResponse {
		public Guid ProfileId { get; init; }
		public string Error { get; init; } = string.Empty;
	}
}
