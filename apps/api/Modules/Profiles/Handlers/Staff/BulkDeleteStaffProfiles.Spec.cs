
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

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
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Handlers.Staff;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class BulkDeleteStaffProfilesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;
	private static readonly string[] MalformedProfileIds = ["not-a-guid"];

	public BulkDeleteStaffProfilesSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	private static string GetBulkDeleteUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.BulkDelete
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var response = await BulkDeleteAsync(
			sessionToken: null,
			new { profileIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForInvalidSession() {
		using var response = await BulkDeleteAsync(
			"invalid-session-token",
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

		using var response = await BulkDeleteAsync(
			tenantToken,
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
				"bulk-delete-staff-profile-no-permission"
			);

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldAllowPermissionedStaffUserToBulkDeleteStaffProfiles() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithPermissionAsync(
				_fixture,
				_authClient,
				"bulk-delete-staff-profile-permissioned",
				AppPermissions.Staff.Profiles.DELETE_FOR_STAFF.Key
			);
		var profileId = await SeedStaffProfileAsync();

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { profileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);

		await AssertStaffProfileDeletedAsync(profileId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedProfileIds() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = MalformedProfileIds }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Keys.Should().Contain("ProfileIds");
	}

	[Theory]
	[MemberData(nameof(InvalidBodies))]
	public async Task ItShouldReturnValidationProblemWhenBodyIsInvalid(string body) {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await BulkDeleteRawJsonAsync(staffToken, body);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Keys.Should().Contain("ProfileIds");
	}

	[Fact]
	public async Task ItShouldAcceptMaximumProfileIdsBoundary() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var body =
			$$"""{ "profileIds": [{{CreateProfileIdsJson(count: 100)}}] }""";

		using var response = await BulkDeleteRawJsonAsync(staffToken, body);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(100);
		result.FailedItems.Should().HaveCount(100);
	}

	[Fact]
	public async Task ItShouldDeleteStaffProfilesInOneBulkRequest() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var firstProfileId = await CreateStaffProfileAsync(staffToken);
		var secondProfileId = await CreateStaffProfileAsync(staffToken);
		await AttachStaffProfileUserLinkAsync(firstProfileId);
		await AttachStaffProfileUserLinkAsync(secondProfileId);
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { firstProfileId, secondProfileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertStaffProfileDeletedAsync(firstProfileId);
		await AssertStaffProfileDeletedAsync(secondProfileId);
		await AssertProfileRelationsRemovedAsync(firstProfileId);
		await AssertProfileRelationsRemovedAsync(secondProfileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 2,
			expectedFailedCount: 0,
			expectedProfileIds: [firstProfileId, secondProfileId]
		);
	}

	[Fact]
	public async Task ItShouldDeduplicateRepeatedStaffProfileIdsBeforeDeleting() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(staffToken);
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { profileId, profileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertStaffProfileDeletedAsync(profileId);
		await AssertProfileRelationsRemovedAsync(profileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 1,
			expectedFailedCount: 0,
			expectedProfileIds: [profileId]
		);
	}

	[Fact]
	public async Task ItShouldReturnPartialResultForMissingStaffProfile() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(staffToken);
		var missingProfileId = Guid.NewGuid();
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { profileId, missingProfileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == missingProfileId
			&& item.Error == "Profile not found"
		);

		await AssertStaffProfileDeletedAsync(profileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 1,
			expectedFailedCount: 1,
			expectedProfileIds: [profileId, missingProfileId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[missingProfileId] = "Profile not found",
			}
		);
	}

	[Fact]
	public async Task ItShouldReportAlreadyDeletedStaffProfilesAsNotFound() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(staffToken);

		using var firstResponse = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { profileId } }
		);
		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var startedAt = DateTime.UtcNow;
		using var secondResponse = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { profileId } }
		);

		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await secondResponse.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == profileId
			&& item.Error == "Profile not found"
		);

		await AssertStaffProfileDeletedAsync(profileId);
		await AssertLatestBulkDeleteAuditLogAsync(
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

	// #1408 r1: the response must account for EVERY requested id — an id the
	// service refuses for any reason (missing, wrong scope, or otherwise
	// undeletable) is a per-item failure with a plain-language reason, never a
	// silent drop. SucceededCount + FailedCount always equals the requested
	// count.
	[Fact]
	public async Task ItShouldAccountForEveryRequestedStaffProfileId() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var deletableProfileId = await CreateStaffProfileAsync(staffToken);
		var notFoundProfileId = Guid.NewGuid();
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { deletableProfileId, notFoundProfileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		(result.SucceededCount + result.FailedCount).Should()
			.Be(2, "every requested id is either succeeded or failed");
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == notFoundProfileId
			&& item.Error == "Profile not found"
		);

		await AssertStaffProfileDeletedAsync(deletableProfileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 1,
			expectedFailedCount: 1,
			expectedProfileIds: [deletableProfileId, notFoundProfileId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[notFoundProfileId] = "Profile not found",
			}
		);
	}

	// #1408 r1: the service must never drop a requested id silently. A
	// default profile is not deletable on any scope, so it must come back as a
	// per-item failure with a plain-language reason — not as a phantom success.
	// The staff scope cannot create one through its API surface
	// (`Profile.CreateStaffProfile` hardcodes IsDefault=false), so this seeds
	// the row directly to pin the accounting invariant at the boundary.
	[Fact]
	public async Task ItShouldReportDefaultStaffProfileAsFailedInsteadOfDroppingIt() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var deletableProfileId = await CreateStaffProfileAsync(staffToken);
		var defaultProfileId = await SeedStaffDefaultProfileAsync();
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { deletableProfileId, defaultProfileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		(result.SucceededCount + result.FailedCount).Should()
			.Be(2, "every requested id is either succeeded or failed");
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == defaultProfileId
			&& item.Error == "Default profiles cannot be deleted"
		);

		await AssertStaffProfileDeletedAsync(deletableProfileId);
		await AssertProfileNotDeletedAsync(defaultProfileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 1,
			expectedFailedCount: 1,
			expectedProfileIds: [deletableProfileId, defaultProfileId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[defaultProfileId] = "Default profiles cannot be deleted",
			}
		);
	}

	[Fact]
	public async Task ItShouldRejectTenantProfilesInStaffProfileBulkDelete() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var tenantProfileId = await SeedTenantProfileAsync(tenantId);
		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			new { profileIds = new[] { tenantProfileId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkProfileActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.ProfileId == tenantProfileId
			&& item.Error == "Profile not found"
		);

		await AssertProfileNotDeletedAsync(tenantProfileId);
		await AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 0,
			expectedFailedCount: 1,
			expectedProfileIds: [tenantProfileId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[tenantProfileId] = "Profile not found",
			}
		);
	}

	public static TheoryData<string> InvalidBodies() {
		return new TheoryData<string> {
			"""{}""",
			"""{ "profileIds": null }""",
			"""{ "profileIds": "not-an-array" }""",
			"""{ "profileIds": [null] }""",
			"""{ "profileIds": [123] }""",
			"""{ "profileIds": [{}] }""",
			"""{ "profileIds": [] }""",
		// The validator allows at most 100 profile IDs per bulk request.
			$$"""
			{
				"profileIds": [
					{{CreateProfileIdsJson(count: 101)}}
				]
			}
			""",
		};
	}

	private async Task<Guid> CreateStaffProfileAsync(string staffToken) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateProfileUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			name = "Bulk Delete Staff Profile " + Guid.NewGuid().ToString("N")[..8],
			description = "Profile created for bulk delete tests",
			permissions = new[] { AppPermissions.Staff.Profiles.GET_FOR_STAFF.Key },
			emails = Array.Empty<string>()
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffProfileCreated>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.ProfileId;
	}

	private async Task<Guid> SeedStaffProfileAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var profile = Profile.CreateStaffProfile(
			"Seeded Staff Bulk Delete " + Guid.NewGuid().ToString("N")[..8],
			"Profile seeded for permission-only bulk delete tests"
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid> GetTenantIdAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	// The staff scope cannot hold a default profile through any API or seeder
	// path (CreateStaffProfile hardcodes IsDefault=false and
	// ValidateProfileType rejects the combination), but the bulk-delete
	// boundary must still account for one if it ever reaches the database.
	// Seeding directly is what lets the spec pin that accounting contract.
	private async Task<Guid> SeedStaffDefaultProfileAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var profile = Profile.CreateStaffProfile(
			"Seeded Staff Default " + Guid.NewGuid().ToString("N")[..8],
			"Default-flagged profile seeded for bulk delete accounting tests"
		);
		profile.IsDefault = true;

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task<Guid> SeedTenantProfileAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var profile = Profile.CreateTenantProfile(
			tenantId,
			"Wrong Scope Bulk Delete " + Guid.NewGuid().ToString("N")[..8]
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task AttachStaffProfileUserLinkAsync(Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var userAccountId = await GetStaffAccountIdByEmailAsync(
			dbContext,
			TestConstants.StaffAdminEmail
		);

		// Create only the join row here because the API-created staff profile already
		// carries a ProfilePermission row from its request permissions.
		await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
			UserAccountId = userAccountId,
			ProfileId = profileId,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task<HttpResponseMessage> BulkDeleteAsync(
		string? sessionToken,
		object body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkDeleteUrl()
		);

		if (sessionToken is not null) {
			request.WithSessionToken(sessionToken);
		}

		request.Content = JsonContent.Create(body);
		return await _http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> BulkDeleteRawJsonAsync(
		string sessionToken,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkDeleteUrl()
		).WithSessionToken(sessionToken);

		request.Content = new StringContent(
			body,
			Encoding.UTF8,
			"application/json"
		);

		return await _http.SendAsync(request);
	}

	private async Task AssertStaffProfileDeletedAsync(Guid profileId) {
		var profile = await GetProfileIgnoringFiltersAsync(profileId);
		profile.Should().NotBeNull();
		if (profile is null) {
			throw new InvalidOperationException("Seeded profile could not be loaded.");
		}

		profile.Scope.Should().Be(ProfileScope.Staff);
		profile.IsDeleted.Should().BeTrue();
		profile.DeletedAt.Should().NotBeNull();
	}

	private async Task AssertProfileNotDeletedAsync(Guid profileId) {
		var profile = await GetProfileIgnoringFiltersAsync(profileId);
		profile.Should().NotBeNull();
		if (profile is null) {
			throw new InvalidOperationException("Seeded profile could not be loaded.");
		}

		profile.IsDeleted.Should().BeFalse();
		profile.DeletedAt.Should().BeNull();
	}

	private async Task AssertProfileRelationsRemovedAsync(Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

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
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from profile in dbContext.Profile.IgnoreQueryFilters()
			where profile.Id == profileId
			select profile
		).FirstOrDefaultAsync();
	}

	private async Task AssertLatestBulkDeleteAuditLogAsync(
		DateTime startedAt,
		int expectedRequestedCount,
		int expectedSucceededCount,
		int expectedFailedCount,
		IReadOnlyCollection<Guid>? expectedProfileIds = null,
		IReadOnlyDictionary<Guid, string>? expectedFailedItems = null
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var auditLog = await (
			from log in dbContext.AuditLog
			where log.Action == AuditActions.StaffProfileBulkDeleted
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
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

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

	private static async Task<Guid> GetStaffAccountIdByEmailAsync(
		AppDbContext dbContext,
		string email
	) {
		var accountId = await (
			from account in dbContext.UserAccount
			where account.User.Email == email
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account.Id
		).FirstOrDefaultAsync();

		if (accountId is null) {
			throw new InvalidOperationException("Seeded staff account was not found.");
		}

		return accountId.Value;
	}

	private static async Task<Guid> GetUserIdByEmailAsync(
		AppDbContext dbContext,
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
