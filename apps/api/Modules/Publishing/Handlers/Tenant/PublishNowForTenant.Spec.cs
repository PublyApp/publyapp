using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Jobs;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// HTTP-level integration spec for POST /posts/{postId}/publish-now (D2 Task 2).
// Bluesky is never touched: the endpoint stops at the trusted enqueue boundary
// proven by PublishNowServiceSpec (D2 Task 1).
public sealed class PublishNowForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public PublishNowForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string PublishUrl(string postId) {
		return $"/posts/{postId}/publish-now";
	}

	[Fact]
	public async Task ItShouldStartPublishingWithSuccessKeyAndOneJobPerPublication() {
		var (acmeId, acmeToken) = await LoginAsAcmeAdminAsync();
		var postId = await SeedAcmePostAsync();
		var (accountA, accountB) = await SeedTwoAcmeAccountsAsync();

		var beforePublications = await CountPublicationsAsync();
		var beforeJobs = await CountAcmePublishJobsAsync(acmeId);

		using var response = await PublishNowAsync(
			acmeToken,
			acmeId,
			postId,
			new { accountIds = new[] { accountA.ToString(), accountB.ToString() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<ApiResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Key.Should().Be(
			"publish-now-success",
			"the action-only success carries the stable translation key"
		);

		(await CountPublicationsAsync()).Should().Be(
			beforePublications + 2,
			"one scheduled publication per chosen account"
		);
		(await CountAcmePublishJobsAsync(acmeId)).Should().Be(
			beforeJobs + 2,
			"exactly one trusted enqueue per publication"
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var audits = await db.AuditLog
			.Where(log => log.Action == AuditActions.PublishNowStarted)
			.Where(log => log.TargetId == Guid.Parse(postId))
			.ToListAsync();
		audits.Should().NotBeEmpty(
			"the started publish is auditable with its account and publication ids"
		);
	}

	[Fact]
	public async Task ItShouldReturn404ForAnotherTenantsPostAndWriteNothing() {
		var (acmeId, publisherEmail) = await CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.PUBLISH.Key,
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await _authClient.LoginAsync(
			publisherEmail, TestConstants.SeedPassword
		);
		var foreignPostId = await SeedTechStartPostAsync();

		var beforePublications = await CountPublicationsAsync();
		var beforeJobs = await CountAcmePublishJobsAsync(acmeId);

		using var response = await PublishNowAsync(
			token,
			acmeId,
			foreignPostId,
			new { accountIds = new[] { Guid.CreateVersion7().ToString() } }
		);

		response.StatusCode.Should().Be(
			HttpStatusCode.NotFound,
			"a post outside the caller's tenant is invisible, not forbidden"
		);
		(await CountPublicationsAsync()).Should().Be(beforePublications);
		(await CountAcmePublishJobsAsync(acmeId)).Should().Be(beforeJobs);
	}

	[Fact]
	public async Task ItShouldReturn422UnderStableKeyAccountIdsForUnknownAccounts() {
		var (acmeId, publisherEmail) = await CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.PUBLISH.Key,
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await _authClient.LoginAsync(
			publisherEmail, TestConstants.SeedPassword
		);
		var postId = await SeedAcmePostAsync();

		using var response = await PublishNowAsync(
			token,
			acmeId,
			postId,
			new { accountIds = new[] { Guid.CreateVersion7().ToString() } }
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("accountIds");
	}

	[Fact]
	public async Task ItShouldReturn403WithoutPostsPublishEvenWithSocialAccountsPublish() {
		var (acmeId, publisherEmail) = await CreatePermittedUserAsync(
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await _authClient.LoginAsync(
			publisherEmail, TestConstants.SeedPassword
		);
		var postId = await SeedAcmePostAsync();

		using var response = await PublishNowAsync(
			token,
			acmeId,
			postId,
			new { accountIds = new[] { Guid.CreateVersion7().ToString() } }
		);

		response.StatusCode.Should().Be(
			HttpStatusCode.Forbidden,
			"publish-now requires the content verb too"
		);
	}

	[Fact]
	public async Task ItShouldReturn403WithoutSocialAccountsPublishEvenWithPostsPublish() {
		var (acmeId, publisherEmail) = await CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.PUBLISH.Key
		);
		var token = await _authClient.LoginAsync(
			publisherEmail, TestConstants.SeedPassword
		);
		var postId = await SeedAcmePostAsync();

		using var response = await PublishNowAsync(
			token,
			acmeId,
			postId,
			new { accountIds = new[] { Guid.CreateVersion7().ToString() } }
		);

		response.StatusCode.Should().Be(
			HttpStatusCode.Forbidden,
			"publishing through accounts needs the socialaccounts verb"
		);
	}

	[Fact]
	public async Task ItShouldReturn400ForAMalformedPostId() {
		var (acmeId, acmeToken) = await LoginAsAcmeAdminAsync();

		using var response = await PublishNowAsync(
			acmeToken,
			acmeId,
			"not-a-guid",
			new { accountIds = new[] { Guid.CreateVersion7().ToString() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	// Pins the API-level path behind the D2 front-e2e acceptance scenario: a
	// NON-admin member holding the publish verbs fires publish-now against an
	// Active Acme Bluesky account and succeeds with exactly one Scheduled
	// publication. The e2e stack seeds that account + profile through the
	// (e2e-only, PUBLISHING_FAKE_PROVIDER-gated) demo seeders; this spec owns
	// its own fixtures so it does not depend on demo seeding running.
	[Fact]
	public async Task ItShouldPublishNowForASeededNonAdminMemberAgainstTheDemoAccount() {
		var (acmeId, memberEmail) = await CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.VIEW.Key,
			AppPermissions.Tenant.Posts.PUBLISH.Key,
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await _authClient.LoginAsync(memberEmail, TestConstants.SeedPassword);
		var postId = await SeedAcmePostAsync();
		var accountId = await SeedAcmeAccountAsync(acmeId);

		using var response = await PublishNowAsync(
			token,
			acmeId,
			postId,
			new { accountIds = new[] { accountId.ToString() } }
		);

		response.StatusCode.Should().Be(
			HttpStatusCode.OK,
			"the non-admin member holds both publish verbs and the spec provisions an Active target"
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var publications = await db.Publication
			.Where(p => p.PostId == Guid.Parse(postId))
			.Where(p => p.SocialAccountId == accountId)
			.ToListAsync();
		publications.Should().ContainSingle(
			"publish-now schedules exactly one publication for the chosen pair"
		);
		publications[0].Status.Should().Be(PublicationStatus.Scheduled);
	}

	// ── helpers ────────────────────────────────────────────────────────

	private async Task<HttpResponseMessage> PublishNowAsync(
		string token,
		Guid tenantId,
		string postId,
		object body
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post, PublishUrl(postId)
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(body);
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
		var email = $"pub-now-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			IsVerified = true,
			Status = UserStatus.Active,
			FirstName = "Publish",
			LastName = "Now",
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
			"publish-now-" + Guid.NewGuid().ToString("N")[..8],
			"spec profile for publish-now permission probes"
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

	private async Task<string> SeedAcmePostAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = await db.Tenant
			.Where(t => t.Name == SeedConstants.Tenants.AcmeName)
			.SingleAsync();
		var user = await db.User
			.Where(u => u.Email == TestConstants.AcmeAdminEmail)
			.SingleAsync();
		var post = new Post {
			TenantId = tenant.GetRequiredId(),
			Body = "publish-now endpoint spec " + Guid.NewGuid().ToString("N"),
			CreatedByUserId = user.GetRequiredId(),
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();
		return post.GetRequiredId().ToString();
	}

	private async Task<string> SeedTechStartPostAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = await db.Tenant
			.Where(t => t.Name == SeedConstants.Tenants.TechStartName)
			.SingleAsync();
		var user = await db.User
			.Where(u => u.Email == TestConstants.TechStartAdminEmail)
			.SingleAsync();
		var post = new Post {
			TenantId = tenant.GetRequiredId(),
			Body = "foreign publish-now spec post",
			CreatedByUserId = user.GetRequiredId(),
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();
		return post.GetRequiredId().ToString();
	}

	private async Task<(Guid AccountA, Guid AccountB)> SeedTwoAcmeAccountsAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = await db.Tenant
			.Where(t => t.Name == SeedConstants.Tenants.AcmeName)
			.SingleAsync();
		var accountA = await SeedAccountAsync(db, tenant.GetRequiredId());
		var accountB = await SeedAccountAsync(db, tenant.GetRequiredId());
		return (accountA, accountB);
	}

	// The Active Acme Bluesky row this spec provisions (stands in for the
	// e2e-only SocialAccountSeeder demo account, so the test owns its fixture).
	private async Task<Guid> SeedAcmeAccountAsync(Guid acmeId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await SeedAccountAsync(db, acmeId);
	}

	private static async Task<Guid> SeedAccountAsync(
		AppDbContext db,
		Guid tenantId
	) {
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@publish-now-endpoint.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private async Task<int> CountPublicationsAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.Publication.CountAsync();
	}

	private async Task<int> CountAcmePublishJobsAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.JobQueue
			.Where(job => job.JobType == PublishingJobs.PublishPublicationV1JobType)
			.Where(job => job.TenantId == tenantId)
			.CountAsync();
	}
}
