
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
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class FindTenantProfileUsersAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantProfileUsersAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string tenantId, string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Users.FindFn(profileId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithOnlyProfileReadPermission() {
		var adminToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(adminToken, tenantId);

		// The members list exposes tenant-user PII, so profile-read alone must
		// not unlock it — the route requires the tenant-users list permission too.
		var token = await CreateStaffUserTokenWithPermissionsAsync(
			"profile-members-profile-read-only",
			AppPermissions.Staff.Profiles.GET_FOR_TENANT.Key
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithOnlyTenantUsersListPermission() {
		var adminToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(adminToken, tenantId);

		var token = await CreateStaffUserTokenWithPermissionsAsync(
			"profile-members-users-list-only",
			AppPermissions.Staff.Users.LIST_FOR_TENANT.Key
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnOkForStaffWithBothProfileReadAndUsersListPermissions() {
		var adminToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(adminToken, tenantId);

		var token = await CreateStaffUserTokenWithPermissionsAsync(
			"profile-members-both-permissions",
			AppPermissions.Staff.Profiles.GET_FOR_TENANT.Key,
			AppPermissions.Staff.Users.LIST_FOR_TENANT.Key
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenProfileBelongsToADifferentTenant() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var acmeTenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var otherTenantId = await GetTenantIdAsync(SeedConstants.Tenants.TechStartName);

		// Profile lives under Acme; requesting it under TechStart must 404, never
		// leak members across tenants.
		var profileId = await CreateTenantProfileAsync(token, acmeTenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(otherTenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForInvalidSortId() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString()) + "?sort_id=not_real"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordNotFound() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
				+ $"?cursor={Guid.NewGuid()}"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnMembersWithTheirOtherProfiles() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);

		var profileA = await CreateTenantProfileAsync(token, tenantId);
		var profileBName = "Other Profile B " + Guid.NewGuid().ToString("N")[..8];
		var profileB = await CreateTenantProfileAsync(token, tenantId, profileBName);
		var profileCName = "Other Profile C " + Guid.NewGuid().ToString("N")[..8];
		var profileC = await CreateTenantProfileAsync(token, tenantId, profileCName);

		var adminAccountId =
			await GetTenantAccountIdAsync(tenantId, SeedConstants.Tenants.AcmeAdminEmail);
		var userAccountId =
			await GetTenantAccountIdAsync(tenantId, SeedConstants.Tenants.AcmeUserEmail);
		// A fresh third member so two members carry DISTINCT other profiles:
		// user → B, third → C. A grouping regression that swaps per-member
		// assignments cannot pass both exact single-element assertions below.
		var thirdAccountId =
			(await SeedTiedProfileMembersAsync(tenantId, profileA, count: 1)).Single();

		await AssignTenantProfilesAsync([
			(adminAccountId, profileA),
			(userAccountId, profileA),
			(userAccountId, profileB),
			(thirdAccountId, profileC),
		]);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileA.ToString()) + "?limit=50"
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<MemberResponse>();
		Assert.NotNull(result);

		// The admin holds ONLY the viewed profile: otherProfiles must be exactly
		// empty (not merely "not containing A").
		var adminMember = result.Data.Single(m =>
			string.Equals(
				m.Email,
				SeedConstants.Tenants.AcmeAdminEmail,
				StringComparison.OrdinalIgnoreCase
			)
		);
		adminMember.OtherProfiles.Should().BeEmpty();

		// The regular user holds A+B: exactly one other profile, and it is B.
		var userMember = result.Data.Single(m =>
			string.Equals(
				m.Email,
				SeedConstants.Tenants.AcmeUserEmail,
				StringComparison.OrdinalIgnoreCase
			)
		);
		userMember.UserAccountId.Should().Be(userAccountId);
		// ContainSingle() (no predicate) asserts the list has exactly ONE item
		// total — any extra profile fails — and .Which pins its exact identity.
		var userOtherProfile = userMember.OtherProfiles.Should().ContainSingle().Which;
		userOtherProfile.Id.Should().Be(profileB);
		userOtherProfile.Name.Should().Be(profileBName);

		// The third member holds A+C: exactly one other profile, and it is C —
		// distinct from the user's, so swapped groupings fail here.
		var thirdMember = result.Data.Single(m => m.UserAccountId == thirdAccountId);
		var thirdOtherProfile =
			thirdMember.OtherProfiles.Should().ContainSingle().Which;
		thirdOtherProfile.Id.Should().Be(profileC);
		thirdOtherProfile.Name.Should().Be(profileCName);
	}

	[Fact]
	public async Task ItShouldPaginateWithCursor() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		var adminAccountId =
			await GetTenantAccountIdAsync(tenantId, SeedConstants.Tenants.AcmeAdminEmail);
		var userAccountId =
			await GetTenantAccountIdAsync(tenantId, SeedConstants.Tenants.AcmeUserEmail);

		await AssignTenantProfilesAsync([
			(adminAccountId, profileId),
			(userAccountId, profileId),
		]);

		using var firstRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString()) + "?limit=1"
		).WithSessionToken(token);

		using var firstResponse = await _http.SendAsync(firstRequest);
		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var firstPage = await firstResponse.Content.ReadFromJsonAsync<MemberResponse>();
		Assert.NotNull(firstPage);
		firstPage.Data.Should().HaveCount(1);
		firstPage.NextCursor.Should().NotBeNullOrEmpty();

		using var secondRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
				+ $"?limit=1&cursor={firstPage.NextCursor}"
		).WithSessionToken(token);

		using var secondResponse = await _http.SendAsync(secondRequest);
		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var secondPage = await secondResponse.Content.ReadFromJsonAsync<MemberResponse>();
		Assert.NotNull(secondPage);
		secondPage.Data.Should().HaveCount(1);
		// The two pages must return distinct members (no overlap across the cursor).
		secondPage.Data[0].UserAccountId.Should().NotBe(firstPage.Data[0].UserAccountId);
	}

	[Theory]
	[InlineData("id", "asc")]
	[InlineData("id", "desc")]
	[InlineData("joined_at", "asc")]
	[InlineData("joined_at", "desc")]
	[InlineData("email", "asc")]
	[InlineData("email", "desc")]
	[InlineData("level", "asc")]
	[InlineData("level", "desc")]
	[InlineData("status", "asc")]
	[InlineData("status", "desc")]
	public async Task ItShouldPaginateWithCursorForEverySortId(
		string sortId,
		string sortOrder
	) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		// Three members with TIED primary sort values wherever the field allows
		// it (identical joinedAt, level, and status), so walking pages must fall
		// through to the UserAccountId tie-breaker — the exact keyset path the
		// page-two boxed-tuple 500 regression lived in.
		var memberAccountIds =
			await SeedTiedProfileMembersAsync(tenantId, profileId, count: 3);

		var collected = new List<Guid>();
		string? cursor = null;

		for (var page = 0; page < memberAccountIds.Count; page++) {
			var url = GetUrl(tenantId.ToString(), profileId.ToString())
				+ $"?limit=1&sort_id={sortId}&sort_order={sortOrder}"
				+ (cursor is null ? string.Empty : $"&cursor={cursor}");

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(token);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(
				HttpStatusCode.OK,
				$"page {page + 1} with sort_id={sortId} sort_order={sortOrder} "
					+ "must not fail"
			);

			var result = await response.Content.ReadFromJsonAsync<MemberResponse>();
			Assert.NotNull(result);
			result.Data.Should().HaveCount(1);
			collected.Add(result.Data[0].UserAccountId);

			cursor = result.NextCursor;
			if (page < memberAccountIds.Count - 1) {
				cursor.Should().NotBeNullOrEmpty();
			}
		}

		// Last page is terminal, and the walk visited every member exactly once
		// (no duplicates or gaps across cursor boundaries).
		cursor.Should().BeNull();
		collected.Should().OnlyHaveUniqueItems();
		collected.Should().BeEquivalentTo(memberAccountIds);
	}

	[Fact]
	public async Task ItShouldReturnEmptyDataForAProfileWithNoMembers() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync(SeedConstants.Tenants.AcmeName);
		var profileId = await CreateTenantProfileAsync(token, tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(tenantId.ToString(), profileId.ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<MemberResponse>();
		Assert.NotNull(result);
		result.Data.Should().BeEmpty();
		result.NextCursor.Should().BeNull();
	}

	// -- Helpers --

	private async Task<Guid> GetTenantIdAsync(string tenantName) {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(_http, token, tenantName);
	}

	private async Task<Guid> CreateTenantProfileAsync(
		string staffToken,
		Guid tenantId,
		string? name = null
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Profiles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Profiles.ForTenantAsStaff.Create
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name = name ?? ("Members Profile " + Guid.NewGuid().ToString("N")[..8]),
				description = "Profile created for FindTenantProfileUsersAsStaffSpec",
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<CreatedProfileResponse>();
		Assert.NotNull(created);
		return created.Profile.Id;
	}

	private async Task<Guid> GetTenantAccountIdAsync(Guid tenantId, string email) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var account = await dbContext.UserAccount.FirstAsync(ua =>
			ua.TenantId == tenantId
			&& ua.Scope == AccountScope.Tenant
			&& ua.User.Email == email
		);

		return account.GetRequiredId();
	}

	private async Task AssignTenantProfilesAsync(
		IEnumerable<(Guid UserAccountId, Guid ProfileId)> assignments
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		foreach (var (userAccountId, profileId) in assignments) {
			await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
				UserAccountId = userAccountId,
				ProfileId = profileId,
			});
		}

		await dbContext.SaveChangesAsync();
	}

	/// <summary>
	/// Seeds a fresh non-admin staff user holding exactly the given permission
	/// keys (via a test-only staff profile), and returns a session token.
	/// Mirrors TenantBulkActionSpecSupport.CreateStaffUserTokenWithPermissionAsync
	/// but accepts multiple keys, for this route's two-permission (AND) matrix.
	/// </summary>
	private async Task<string> CreateStaffUserTokenWithPermissionsAsync(
		string emailPrefix,
		params string[] permissionKeys
	) {
		var email = $"{emailPrefix}-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(_fixture, email);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var staffAccount = await (
			from account in dbContext.UserAccount
			where account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account
		).FirstAsync();

		var profile = Profile.CreateStaffProfile(
			$"{emailPrefix}-permissions-{Guid.NewGuid():N}",
			"Test-only staff profile for the members-list permission matrix"
		);
		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		foreach (var permissionKey in permissionKeys) {
			await dbContext.ProfilePermission.AddAsync(new ProfilePermission {
				ProfileId = profile.GetRequiredId(),
				PermissionKey = permissionKey,
			});
		}

		await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
			UserAccountId = staffAccount.GetRequiredId(),
			ProfileId = profile.GetRequiredId(),
		});
		await dbContext.SaveChangesAsync();

		return await _authClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	/// <summary>
	/// Seeds <paramref name="count"/> fresh tenant members holding the profile,
	/// with TIED primary sort values wherever the schema allows: identical
	/// account CreatedAt (joined_at), identical Level (User) and identical
	/// Status (Active). Emails/ids stay unique by nature. Returns the member
	/// UserAccountIds.
	/// </summary>
	private async Task<List<Guid>> SeedTiedProfileMembersAsync(
		Guid tenantId,
		Guid profileId,
		int count
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var accounts = new List<UserAccount>();

		foreach (var index in Enumerable.Range(0, count)) {
			var user = new User {
				Email = $"tied-member-{index}-{Guid.NewGuid():N}@example.com",
				Password = "unused",
				FirstName = $"Tied{index}",
				LastName = "Member",
				Status = UserStatus.Active,
				IsVerified = true,
			};
			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			var account = UserAccount.CreateTenantAccount(
				user.GetRequiredId(),
				tenantId
			);
			await dbContext.UserAccount.AddAsync(account);
			await dbContext.SaveChangesAsync();

			accounts.Add(account);

			await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
				UserAccountId = account.GetRequiredId(),
				ProfileId = profileId,
			});
		}

		await dbContext.SaveChangesAsync();

		// Tie the joined_at primary value AFTER insert: SaveChanges only rewrites
		// CreatedAt on Added entities (Modified touches UpdatedAt alone), so this
		// post-insert update sticks and every member shares one joined_at.
		var tiedJoinedAt = new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);
		foreach (var account in accounts) {
			account.CreatedAt = tiedJoinedAt;
		}

		await dbContext.SaveChangesAsync();

		return accounts.Select(a => a.GetRequiredId()).ToList();
	}

	// -- Response DTOs --

	private sealed record CreatedProfileResponse {
		public required CreatedProfile Profile { get; init; }
	}

	private sealed record CreatedProfile {
		public Guid Id { get; init; }
	}

	private sealed record MemberResponse {
		public List<MemberItem> Data { get; init; } = [];
		public string? NextCursor { get; init; }
	}

	private sealed record MemberItem {
		public Guid UserAccountId { get; init; }
		public Guid UserId { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Email { get; init; } = string.Empty;
		public string Level { get; init; } = string.Empty;
		public string Status { get; init; } = string.Empty;
		public DateTime JoinedAt { get; init; }
		public List<MemberOtherProfile> OtherProfiles { get; init; } = [];
	}

	private sealed record MemberOtherProfile {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
	}
}
