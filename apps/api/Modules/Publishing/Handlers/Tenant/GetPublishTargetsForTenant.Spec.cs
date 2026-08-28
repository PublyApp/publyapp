using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// HTTP-level integration spec for GET /publishing/publish-targets (D2 Task 4).
// The composer target list: Active accounts of the caller's tenant only, in
// stable created_at/id order, filtered through THE single visibility rule
// (VisibleIn) when project_id is provided. Permission is the block-gating verb
// tenant.socialaccounts.publish — a caller holding posts.view but NOT the
// socialaccounts publish verb gets 403.
public sealed class GetPublishTargetsForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetPublishTargetsForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string TargetsUrl(Guid? projectId) {
		return projectId is null
			? "/publishing/publish-targets"
			: $"/publishing/publish-targets?project_id={projectId}";
	}

	[Fact]
	public async Task ItShouldReturnOnlyActiveTenantTargetsNewestFirst() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var seeded = await SeedTargetScenarioAsync(tenantId);

		using var response = await GetTargetsAsync(token, tenantId, null);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<TargetsPayload>();
		Assert.NotNull(payload);
		payload!.Items.Select(target => target.Id).Should()
			.Contain(seeded.RecentActiveId)
			.And.Contain(seeded.OldActiveId)
			.And.NotContain(seeded.NeedsReconnectId,
				"a NeedsReconnect account is not a valid publish target")
			.And.NotContain(seeded.ForeignActiveId,
				"another tenant's active account is invisible to this tenant");

		var ids = payload.Items.Select(target => target.Id).ToList();
		ids.IndexOf(seeded.RecentActiveId).Should().BeLessThan(
			ids.IndexOf(seeded.OldActiveId),
			"targets are ordered newest-first by creation time"
		);

		var recent = payload.Items.Single(target => target.Id == seeded.RecentActiveId);
		recent.Provider.Should().Be(
			"bluesky",
			"the provider uses the same snake_case wire value as the accounts slice"
		);
		recent.Label.Should().Be(seeded.RecentHandle);
	}

	// Pins the composer contract the D2 front-e2e scenario depends on
	// (tenant-posts-publish-now.spec.ts): the composer target list must contain
	// an Active Acme Bluesky account. The e2e stack seeds that account through
	// the (e2e-only, PUBLISHING_FAKE_PROVIDER-gated) SocialAccountSeeder; this
	// spec owns its fixture so it does not depend on demo seeding running.
	[Fact]
	public async Task ItShouldListTheDemoSeededAcmeBlueskyAccountForATenantAdmin() {
		var (_, token) = await LoginAsAcmeAdminAsync();
		var acmeId = await GetAcmeIdAsync();
		await SeedAcmeAccountAsync(acmeId);

		using var response = await GetTargetsAsync(token, acmeId, null);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<TargetsPayload>();
		Assert.NotNull(payload);
		payload!.Items.Should()
			.Contain(
				target => target.Provider == "bluesky",
				"the spec seeds one Active Acme Bluesky account so the composer's "
					+ "publish-target list is never empty in test stacks"
			);
	}

	// Pins the PERMISSION half of the D2 front-e2e contract: the scenario logs in
	// as a NON-admin member and the composer's "Publish on" block renders only
	// with tenant.socialaccounts.publish. The e2e stack grants that verb through
	// the (e2e-only, PUBLISHING_FAKE_PROVIDER-gated) PublishingProfileSeeder and
	// seeds the account through SocialAccountSeeder; this spec owns both fixtures
	// (a member holding exactly the publish verb + one Active Acme account) so it
	// does not depend on demo seeding running.
	[Fact]
	public async Task ItShouldListPublishTargetsForTheSeededNonAdminMember() {
		var acmeId = await GetAcmeIdAsync();
		await SeedAcmeAccountAsync(acmeId);
		var (_, memberEmail) = await CreatePermittedUserAsync(
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await _authClient.LoginAsync(memberEmail, TestConstants.SeedPassword);

		using var response = await GetTargetsAsync(token, acmeId, null);

		response.StatusCode.Should().Be(
			HttpStatusCode.OK,
			"a member holding socialaccounts.publish may list publish targets"
		);
		var payload = await response.Content.ReadFromJsonAsync<TargetsPayload>();
		Assert.NotNull(payload);
		payload!.Items.Should().NotBeEmpty(
			"the seeded Active account is a valid target for a permitted member"
		);
	}

	[Fact]
	public async Task ItShouldApplyTheVisibilityRuleWhenProjectIdIsProvided() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var scenario = await SeedTargetScenarioAsync(tenantId);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var projectOne = await SeedProjectAsync(db, tenantId);
		var projectTwo = await SeedProjectAsync(db, tenantId);
		db.SocialAccountProject.Add(new SocialAccountProject {
			SocialAccountId = scenario.EverywhereActiveId,
			ProjectId = projectOne,
		});
		db.SocialAccountProject.Add(new SocialAccountProject {
			SocialAccountId = scenario.OldActiveId,
			ProjectId = projectOne,
		});
		await db.SaveChangesAsync();
		// scenario.RecentActiveId stays unattached: visible in every project.

		using var scopedResponse = await GetTargetsAsync(token, tenantId, projectOne);
		scopedResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var scopedPayload = await scopedResponse.Content
			.ReadFromJsonAsync<TargetsPayload>();
		Assert.NotNull(scopedPayload);
		// Intersect with the pinned scenario ids: other tests of this class may
		// have seeded additional unattached Acme accounts (visible everywhere),
		// and those extras carry no information about THIS rule.
		var pinned = new HashSet<Guid> {
			scenario.OldActiveId,
			scenario.EverywhereActiveId,
			scenario.RecentActiveId,
			scenario.NeedsReconnectId,
			scenario.ForeignActiveId,
		};
		var scopedPinnedIds = scopedPayload!.Items
			.Select(target => target.Id)
			.Where(id => pinned.Contains(id))
			.ToList();
		scopedPinnedIds.Should()
			.Equal(
				[scenario.RecentActiveId, scenario.EverywhereActiveId,
					scenario.OldActiveId],
				"project members and unattached (everywhere) accounts pass "
					+ "VisibleIn, newest-first"
			);

		using var otherResponse = await GetTargetsAsync(token, tenantId, projectTwo);
		otherResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var otherPayload = await otherResponse.Content
			.ReadFromJsonAsync<TargetsPayload>();
		Assert.NotNull(otherPayload);
		otherPayload!.Items
			.Select(target => target.Id)
			.Where(id => pinned.Contains(id))
			.Should()
			.Equal(
				[scenario.RecentActiveId],
				"only unattached accounts are visible to a project with no links"
			);
	}

	[Fact]
	public async Task ItShouldReturn400ForAMalformedProjectId() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			"/publishing/publish-targets?project_id=not-a-guid"
		).WithSessionToken(token).WithTenantId(tenantId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturn403WithoutSocialAccountsPublishEvenWithPostsView() {
		var (tenantId, memberEmail) = await CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.VIEW.Key
		);
		var token = await _authClient.LoginAsync(
			memberEmail, TestConstants.SeedPassword
		);

		using var response = await GetTargetsAsync(token, tenantId, null);

		response.StatusCode.Should().Be(
			HttpStatusCode.Forbidden,
			"the block-gating verb is socialaccounts.publish, even with posts.view"
		);
	}

	[Fact]
	public async Task ItShouldReturn200ForACallerHoldingOnlyThePublishVerb() {
		var (tenantId, memberEmail) = await CreatePermittedUserAsync(
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await _authClient.LoginAsync(
			memberEmail, TestConstants.SeedPassword
		);
		await SeedTargetScenarioAsync(tenantId);

		using var response = await GetTargetsAsync(token, tenantId, null);

		response.StatusCode.Should().Be(
			HttpStatusCode.OK,
			"the endpoint gates on exactly the socialaccounts.publish verb"
		);
	}

	// ── helpers ────────────────────────────────────────────────────────

	private async Task<HttpResponseMessage> GetTargetsAsync(
		string token,
		Guid tenantId,
		Guid? projectId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get, TargetsUrl(projectId)
		).WithSessionToken(token).WithTenantId(tenantId);
		return await _http.SendAsync(request);
	}

	private async Task<(Guid TenantId, string Token)> LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> GetAcmeIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http, staffToken, SeedConstants.Tenants.AcmeName
		);
	}

	// Creates a non-admin tenant member of Acme holding EXACTLY the given
	// permission keys through a fresh profile, and returns the email to log
	// in with (seed password).
	private async Task<(Guid TenantId, string Email)> CreatePermittedUserAsync(
		params string[] permissionKeys
	) {
		var acmeId = await GetAcmeIdAsync();
		var email = $"pub-targets-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			IsVerified = true,
			Status = UserStatus.Active,
			FirstName = "Publish",
			LastName = "Targets",
		};
		db.User.Add(user);
		await db.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(
			user.GetRequiredId(), acmeId, AccountLevel.User
		);
		account.ValidateAccountType();
		db.UserAccount.Add(account);

		var profile = Profile.CreateTenantProfile(
			acmeId,
			"publish-targets-" + Guid.NewGuid().ToString("N")[..8],
			"spec profile for publish-targets permission probes"
		);
		profile.ValidateProfileType();
		db.Profile.Add(profile);
		await db.SaveChangesAsync();

		foreach (var key in permissionKeys) {
			db.ProfilePermission.Add(new ProfilePermission {
				ProfileId = profile.GetRequiredId(),
				PermissionKey = key,
			});
		}
		db.UserAccountProfile.Add(new UserAccountProfile {
			UserAccountId = account.GetRequiredId(),
			ProfileId = profile.GetRequiredId(),
		});
		await db.SaveChangesAsync();

		return (acmeId, email);
	}

	private sealed record SeededScenario(
		Guid OldActiveId,
		Guid EverywhereActiveId,
		Guid RecentActiveId,
		Guid NeedsReconnectId,
		Guid ForeignActiveId,
		string RecentHandle
	);

	// Seeds one Active Acme Bluesky account (stands in for the e2e-only
	// SocialAccountSeeder demo account, so this spec owns its fixture).
	private async Task<Guid> SeedAcmeAccountAsync(Guid acmeId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await SeedAccountAsync(
			db, acmeId, "@publish-targets-demo.bsky.social", minutesAgo: 1
		);
	}

	// Seeds three Active Acme accounts with pinned CreatedAt values (old, then
	// everywhere-only, then recent), one NeedsReconnect Acme account, and one
	// Active TechStart account that must never leak into Acme's targets.
	private async Task<SeededScenario> SeedTargetScenarioAsync(Guid acmeId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		const string recentHandle = "@publish-targets-recent.bsky.social";
		var oldActive = await SeedAccountAsync(
			db, acmeId, "@publish-targets-old.bsky.social", minutesAgo: 120
		);
		var everywhereActive = await SeedAccountAsync(
			db, acmeId, "@publish-targets-everywhere.bsky.social", minutesAgo: 90
		);
		var recentActive = await SeedAccountAsync(
			db, acmeId, recentHandle, minutesAgo: 60
		);
		var needsReconnect = await SeedStatusedAccountAsync(
			db, acmeId, SocialAccountStatus.NeedsReconnect, minutesAgo: 30
		);

		var techStartId = await db.Tenant
			.Where(t => t.Name == SeedConstants.Tenants.TechStartName)
			.SingleAsync();
		var foreignActive = await SeedStatusedAccountAsync(
			db, techStartId.GetRequiredId(), SocialAccountStatus.Active, minutesAgo: 10
		);

		return new SeededScenario(
			OldActiveId: oldActive,
			EverywhereActiveId: everywhereActive,
			RecentActiveId: recentActive,
			NeedsReconnectId: needsReconnect,
			ForeignActiveId: foreignActive,
			RecentHandle: recentHandle
		);
	}

	// The SaveChanges interceptor rewrites CreatedAt for BaseAttributesNoKey
	// descendants on insert, so the pinned creation order is applied with a raw
	// UPDATE afterwards.
	private static async Task<Guid> SeedAccountAsync(
		AppDbContext db,
		Guid tenantId,
		string displayHandle,
		int minutesAgo
	) {
		return await SeedStatusedAccountAsync(
			db, tenantId, SocialAccountStatus.Active, minutesAgo, displayHandle
		);
	}

	private static async Task<Guid> SeedStatusedAccountAsync(
		AppDbContext db,
		Guid tenantId,
		SocialAccountStatus status,
		int minutesAgo,
		string? displayHandle = null
	) {
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = displayHandle ?? $"@stale-{Guid.NewGuid():N}.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
			Status = status,
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		var createdAt = DateTime.UtcNow.AddMinutes(-minutesAgo);
		await db.Database.ExecuteSqlInterpolatedAsync(
			$"UPDATE social_accounts SET created_at = {createdAt}, updated_at = {createdAt} WHERE id = {account.GetRequiredId()}"
		);
		return account.GetRequiredId();
	}

	private static async Task<Guid> SeedProjectAsync(
		AppDbContext db,
		Guid tenantId
	) {
		var project = new Project {
			TenantId = tenantId,
			Name = $"publish-targets-{Guid.NewGuid():N}"[..40],
		};
		db.Project.Add(project);
		await db.SaveChangesAsync();
		return project.GetRequiredId();
	}

	private sealed record TargetItem(
		Guid Id,
		string Label,
		string Provider
	);

	private sealed record TargetsPayload(IReadOnlyList<TargetItem> Items);
}
