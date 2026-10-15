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
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public PublishNowForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _PublishUrl(string postId) {
		return $"/posts/{postId}/publish-now";
	}

	[Fact]
	public async Task ItShouldStartPublishingWithSuccessKeyAndOneJobPerPublication() {
		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		var postId = await this._SeedAcmePostAsync();
		var (accountA, accountB) = await this._SeedTwoAcmeAccountsAsync();

		var beforePublications = await this._CountPublicationsAsync();
		var beforeJobs = await this._CountAcmePublishJobsAsync(acmeId);

		using var response = await this._PublishNowAsync(
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

		(await this._CountPublicationsAsync()).Should().Be(
			beforePublications + 2,
			"one scheduled publication per chosen account"
		);
		(await this._CountAcmePublishJobsAsync(acmeId)).Should().Be(
			beforeJobs + 2,
			"exactly one trusted enqueue per publication"
		);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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
		var (acmeId, publisherEmail) = await this._CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.PUBLISH.Key,
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await this._AuthClient.LoginAsync(
			publisherEmail, TestConstants.SeedPassword
		);
		var foreignPostId = await this._SeedTechStartPostAsync();

		var beforePublications = await this._CountPublicationsAsync();
		var beforeJobs = await this._CountAcmePublishJobsAsync(acmeId);

		using var response = await this._PublishNowAsync(
			token,
			acmeId,
			foreignPostId,
			new { accountIds = new[] { Guid.CreateVersion7().ToString() } }
		);

		response.StatusCode.Should().Be(
			HttpStatusCode.NotFound,
			"a post outside the caller's tenant is invisible, not forbidden"
		);
		(await this._CountPublicationsAsync()).Should().Be(beforePublications);
		(await this._CountAcmePublishJobsAsync(acmeId)).Should().Be(beforeJobs);
	}

	[Fact]
	public async Task ItShouldReturn422UnderStableKeyAccountIdsForUnknownAccounts() {
		var (acmeId, publisherEmail) = await this._CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.PUBLISH.Key,
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await this._AuthClient.LoginAsync(
			publisherEmail, TestConstants.SeedPassword
		);
		var postId = await this._SeedAcmePostAsync();

		using var response = await this._PublishNowAsync(
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
		var (acmeId, publisherEmail) = await this._CreatePermittedUserAsync(
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await this._AuthClient.LoginAsync(
			publisherEmail, TestConstants.SeedPassword
		);
		var postId = await this._SeedAcmePostAsync();

		using var response = await this._PublishNowAsync(
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
		var (acmeId, publisherEmail) = await this._CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.PUBLISH.Key
		);
		var token = await this._AuthClient.LoginAsync(
			publisherEmail, TestConstants.SeedPassword
		);
		var postId = await this._SeedAcmePostAsync();

		using var response = await this._PublishNowAsync(
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
		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();

		using var response = await this._PublishNowAsync(
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
		var (acmeId, memberEmail) = await this._CreatePermittedUserAsync(
			AppPermissions.Tenant.Posts.VIEW.Key,
			AppPermissions.Tenant.Posts.PUBLISH.Key,
			AppPermissions.Tenant.SocialAccounts.PUBLISH.Key
		);
		var token = await this._AuthClient.LoginAsync(memberEmail, TestConstants.SeedPassword);
		var postId = await this._SeedAcmePostAsync();
		var accountId = await this._SeedAcmeAccountAsync(acmeId);

		using var response = await this._PublishNowAsync(
			token,
			acmeId,
			postId,
			new { accountIds = new[] { accountId.ToString() } }
		);

		response.StatusCode.Should().Be(
			HttpStatusCode.OK,
			"the non-admin member holds both publish verbs and the spec provisions an Active target"
		);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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

	[Fact]
	public async Task ItShouldAccept300GraphemesAndRejectThe301stWithATypedProblem() {
		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAcmeAccountAsync(acmeId);

		var okPostId = await this._SeedAcmePostAsync(new string('a', 300));
		using var ok = await this._PublishNowAsync(
			acmeToken, acmeId, okPostId,
			new { accountIds = new[] { accountId.ToString() } }
		);
		ok.StatusCode.Should().Be(HttpStatusCode.OK);

		var longPostId = await this._SeedAcmePostAsync(new string('a', 301));
		var beforePublications = await this._CountPublicationsAsync();
		using var rejected = await this._PublishNowAsync(
			acmeToken, acmeId, longPostId,
			new { accountIds = new[] { accountId.ToString() } }
		);

		rejected.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var problem = System.Text.Json.JsonDocument.Parse(
			await rejected.Content.ReadAsStringAsync()
		);
		var root = problem.RootElement;
		root.GetProperty("translationKey").GetString().Should().Be("publish-content-too-long");
		root.GetProperty("provider").GetString().Should().Be("bluesky");
		root.GetProperty("limit").GetInt32().Should().Be(300);
		root.GetProperty("actual").GetInt32().Should().Be(301);
		root.GetProperty("unit").GetString().Should().Be("graphemes");
		(await this._CountPublicationsAsync()).Should().Be(
			beforePublications,
			"a refused publish writes no publication"
		);
	}

	[Fact]
	public async Task ItShouldRejectTextOverTheByteCapEvenWhenGraphemesFit() {
		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAcmeAccountAsync(acmeId);
		var family = "\U0001F468\u200D\U0001F469\u200D\U0001F467\u200D\U0001F466";
		var postId = await this._SeedAcmePostAsync(
			string.Concat(Enumerable.Repeat(family, 150))
		);

		using var rejected = await this._PublishNowAsync(
			acmeToken, acmeId, postId,
			new { accountIds = new[] { accountId.ToString() } }
		);

		rejected.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var problem = System.Text.Json.JsonDocument.Parse(
			await rejected.Content.ReadAsStringAsync()
		);
		problem.RootElement.GetProperty("unit").GetString().Should().Be("bytes");
		problem.RootElement.GetProperty("limit").GetInt32().Should().Be(3000);
	}

	[Fact]
	public async Task ItShouldRejectAGifOrMoreThanFourImagesWithATypedProblemNamingTheCause() {
		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAcmeAccountAsync(acmeId);

		var gifPostId = await this._SeedAcmePostWithImagesAsync("image/png", "image/gif");
		var before = await this._CountPublicationsAsync();
		using var gif = await this._PublishNowAsync(
			acmeToken, acmeId, gifPostId,
			new { accountIds = new[] { accountId.ToString() } }
		);
		gif.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var gifProblem = System.Text.Json.JsonDocument.Parse(await gif.Content.ReadAsStringAsync());
		gifProblem.RootElement.GetProperty("translationKey").GetString()
			.Should().Be("publish-image-unsupported-type");
		gifProblem.RootElement.GetProperty("imageIndex").GetInt32().Should().Be(2);

		var manyPostId = await this._SeedAcmePostWithImagesAsync(
			"image/png", "image/png", "image/png", "image/png", "image/png"
		);
		using var many = await this._PublishNowAsync(
			acmeToken, acmeId, manyPostId,
			new { accountIds = new[] { accountId.ToString() } }
		);
		many.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		using var manyProblem = System.Text.Json.JsonDocument.Parse(await many.Content.ReadAsStringAsync());
		manyProblem.RootElement.GetProperty("translationKey").GetString()
			.Should().Be("publish-images-too-many");
		manyProblem.RootElement.GetProperty("limit").GetInt32().Should().Be(4);
		manyProblem.RootElement.GetProperty("actual").GetInt32().Should().Be(5);

		(await this._CountPublicationsAsync()).Should().Be(before, "refused publishes write nothing");
	}

	// ── helpers ────────────────────────────────────────────────────────

	private async Task<string> _SeedAcmePostWithImagesAsync(params string[] contentTypes) {
		var postId = await this._SeedAcmePostAsync("");
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var post = await db.Post.SingleAsync(p => p.Id == Guid.Parse(postId));
		for (var index = 0; index < contentTypes.Length; index++) {
			db.PostMediaAsset.Add(new PostMediaAsset {
				TenantId = post.TenantId,
				PostId = post.GetRequiredId(),
				Position = index,
				RelativePath = $"uploads/spec/{Guid.NewGuid():N}.bin",
				ContentType = contentTypes[index],
				WidthPx = 8,
				HeightPx = 8,
				SizeBytes = 64,
				UploadedByUserId = post.CreatedByUserId,
			});
		}
		await db.SaveChangesAsync();
		return postId;
	}

	private async Task<HttpResponseMessage> _PublishNowAsync(
		string token,
		Guid tenantId,
		string postId,
		object body
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post, PublishNowForTenantSpec._PublishUrl(postId)
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(body);
		return await this._Http.SendAsync(request);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> _GetAcmeIdAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.AcmeName
		);
	}

	// Creates a non-admin tenant member of Acme holding EXACTLY the given
	// permission keys through a fresh profile, and returns the email to log
	// in with (seed password).
	private async Task<(Guid TenantId, string Email)> _CreatePermittedUserAsync(
		params string[] permissionKeys
	) {
		var acmeId = await this._GetAcmeIdAsync();
		var email = $"pub-now-{Guid.NewGuid():N}@example.com";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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

	private async Task<string> _SeedAcmePostAsync(string? body = null) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = await db.Tenant
			.Where(t => t.Name == SeedConstants.Tenants.AcmeName)
			.SingleAsync();
		var user = await db.User
			.Where(u => u.Email == TestConstants.AcmeAdminEmail)
			.SingleAsync();
		var post = new Post {
			TenantId = tenant.GetRequiredId(),
			Body = body ?? ("publish-now endpoint spec " + Guid.NewGuid().ToString("N")),
			CreatedByUserId = user.GetRequiredId(),
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();
		return post.GetRequiredId().ToString();
	}

	private async Task<string> _SeedTechStartPostAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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

	private async Task<(Guid AccountA, Guid AccountB)> _SeedTwoAcmeAccountsAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = await db.Tenant
			.Where(t => t.Name == SeedConstants.Tenants.AcmeName)
			.SingleAsync();
		var accountA = await PublishNowForTenantSpec._SeedAccountAsync(db, tenant.GetRequiredId());
		var accountB = await PublishNowForTenantSpec._SeedAccountAsync(db, tenant.GetRequiredId());
		return (accountA, accountB);
	}

	// The Active Acme Bluesky row this spec provisions (stands in for the
	// e2e-only SocialAccountSeeder demo account, so the test owns its fixture).
	private async Task<Guid> _SeedAcmeAccountAsync(Guid acmeId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await PublishNowForTenantSpec._SeedAccountAsync(db, acmeId);
	}

	private static async Task<Guid> _SeedAccountAsync(
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

	private async Task<int> _CountPublicationsAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.Publication.CountAsync();
	}

	private async Task<int> _CountAcmePublishJobsAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.JobQueue
			.Where(job => job.JobType == PublishingJobs.PublishPublicationV1JobType)
			.Where(job => job.TenantId == tenantId)
			.CountAsync();
	}
}
