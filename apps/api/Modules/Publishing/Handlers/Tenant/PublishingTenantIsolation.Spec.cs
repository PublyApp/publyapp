using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// #2460: the publishing services no longer write `TenantId ==` by hand; the global tenant
// filter does it. Two tenants, each with an account, a post and a scheduled publication,
// driven through the real endpoints: A never sees or touches B's rows.
public sealed class PublishingTenantIsolationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public PublishingTenantIsolationSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldListOnlyTheCallersPublicationsAndTargets() {
		var (a, b) = await this._SeedBothTenantsAsync();
		var session = await this._LoginAcmeAsync();

		using var list = await this._SendAsync(HttpMethod.Get, "/publishing/publications?limit=100", session);
		list.StatusCode.Should().Be(HttpStatusCode.OK);
		var page = await list.Content.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
		Assert.NotNull(page);
		page.Data.Select(item => item.Id).Should().Contain(a.PublicationId)
			.And.NotContain(b.PublicationId);

		using var targets = await this._SendAsync(HttpMethod.Get, "/publishing/publish-targets", session);
		targets.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await targets.Content.ReadFromJsonAsync<GetPublishTargetsForTenantResponse>();
		Assert.NotNull(payload);
		payload.Items.Select(item => item.Label).Should().Contain(a.Handle)
			.And.NotContain(b.Handle);
	}

	[Fact]
	public async Task ItShouldReadAPostsPublicationsOnlyInsideTheCallersTenant() {
		var (a, b) = await this._SeedBothTenantsAsync();
		var session = await this._LoginAcmeAsync();

		using var own = await this._SendAsync(HttpMethod.Get, $"/posts/{a.PostId}/publications", session);
		own.StatusCode.Should().Be(HttpStatusCode.OK);

		using var foreign = await this._SendAsync(HttpMethod.Get, $"/posts/{b.PostId}/publications", session);
		foreign.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldNotRetryRenditionOrCancelAnotherTenantsRows() {
		var (_, b) = await this._SeedBothTenantsAsync();
		var session = await this._LoginAcmeAsync();

		using var retry = await this._SendAsync(
			HttpMethod.Post, $"/posts/publications/{b.PublicationId}/retry", session
		);
		retry.StatusCode.Should().Be(HttpStatusCode.NotFound);

		using var rendition = await this._SendAsync(
			HttpMethod.Get, $"/posts/publications/{b.PublicationId}/rendition", session
		);
		rendition.StatusCode.Should().Be(HttpStatusCode.NotFound);

		using var cancel = await this._SendAsync(HttpMethod.Delete, $"/posts/{b.PostId}/schedule", session);
		cancel.StatusCode.Should().Be(HttpStatusCode.NotFound);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var stillThere = await db.Publication.IgnoreQueryFilters()
			.SingleAsync(p => p.Id == b.PublicationId);
		stillThere.IsDeleted.Should().BeFalse("a foreign cancel must not reach the row");
		stillThere.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldRefuseSchedulingOrPublishingToAnotherTenantsAccount() {
		var (a, b) = await this._SeedBothTenantsAsync();
		var session = await this._LoginAcmeAsync();
		var before = await this._CountPublicationsAsync(b.AccountId);

		var schedule = new {
			accountIds = new[] { b.AccountId.ToString() },
			scheduledAtLocal = "2099-08-26T07:00:00Z",
			timeZone = "Europe/Paris",
		};
		var unknownSchedule = new {
			accountIds = new[] { Guid.CreateVersion7().ToString() },
			scheduledAtLocal = "2099-08-26T07:00:00Z",
			timeZone = "Europe/Paris",
		};
		using var foreignScheduled = await this._SendAsync(HttpMethod.Post, $"/posts/{a.PostId}/schedule", session, schedule);
		using var unknownScheduled = await this._SendAsync(HttpMethod.Post, $"/posts/{a.PostId}/schedule", session, unknownSchedule);
		foreignScheduled.StatusCode.Should().NotBe(HttpStatusCode.OK).And.NotBe(HttpStatusCode.Created);
		foreignScheduled.StatusCode.Should().Be(unknownScheduled.StatusCode, "a foreign account reads as unknown");

		using var foreignNow = await this._SendAsync(
			HttpMethod.Post, $"/posts/{a.PostId}/publish-now", session,
			new { accountIds = new[] { b.AccountId.ToString() } }
		);
		using var unknownNow = await this._SendAsync(
			HttpMethod.Post, $"/posts/{a.PostId}/publish-now", session,
			new { accountIds = new[] { Guid.CreateVersion7().ToString() } }
		);
		foreignNow.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		foreignNow.StatusCode.Should().Be(unknownNow.StatusCode, "a foreign account reads as unknown");

		(await this._CountPublicationsAsync(b.AccountId)).Should().Be(before, "nothing is created for B");
	}

	[Fact]
	public async Task ItShouldNotEditAnotherTenantsSchedule() {
		var (_, b) = await this._SeedBothTenantsAsync();
		var session = await this._LoginAcmeAsync();

		using var edit = await this._SendAsync(
			HttpMethod.Patch, $"/posts/{b.PostId}/schedule", session,
			new { scheduledAtLocal = "2099-08-26T07:00:00Z", timeZone = "Europe/Paris" }
		);
		edit.StatusCode.Should().Be(HttpStatusCode.NotFound);

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var row = await db.Publication.IgnoreQueryFilters().SingleAsync(p => p.Id == b.PublicationId);
		row.ScheduledAtUtc.Year.Should().NotBe(2099, "B's schedule was not moved");
	}

	private async Task<int> _CountPublicationsAsync(Guid accountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.Publication.IgnoreQueryFilters().CountAsync(p => p.SocialAccountId == accountId);
	}

	private async Task<(string Token, Guid TenantId)> _LoginAcmeAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (token, tenantId);
	}

	private async Task<HttpResponseMessage> _SendAsync(
		HttpMethod method,
		string url,
		(string Token, Guid TenantId) session,
		object? body = null
	) {
		using var request = new HttpRequestMessage(method, url)
			.WithSessionToken(session.Token).WithTenantId(session.TenantId);
		if (body is not null) {
			request.Content = JsonContent.Create(body);
		}

		return await this._Http.SendAsync(request);
	}

	private sealed record Seeded(Guid PostId, Guid PublicationId, Guid AccountId, string Handle);

	private async Task<(Seeded Acme, Seeded TechStart)> _SeedBothTenantsAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var acme = await PublishingTenantIsolationSpec._SeedAsync(
			db, SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail
		);
		var techStart = await PublishingTenantIsolationSpec._SeedAsync(
			db, SeedConstants.Tenants.TechStartName, TestConstants.TechStartAdminEmail
		);
		return (acme, techStart);
	}

	private static async Task<Seeded> _SeedAsync(AppDbContext db, string tenantName, string adminEmail) {
		var tenant = await db.Tenant.SingleAsync(t => t.Name == tenantName);
		var user = await db.User.SingleAsync(u => u.Email == adminEmail);
		var handle = $"@iso-{Guid.NewGuid():N}.bsky.social";
		var account = new SocialAccount {
			TenantId = tenant.GetRequiredId(),
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = handle,
			ProtectedCredentials = "enc-spec-blob",
		};
		var post = new Post {
			TenantId = tenant.GetRequiredId(),
			Body = "tenant isolation spec post",
			CreatedByUserId = user.GetRequiredId(),
		};
		db.SocialAccount.Add(account);
		db.Post.Add(post);
		await db.SaveChangesAsync();

		var id = Guid.CreateVersion7();
		db.Publication.Add(new Publication {
			Id = id,
			TenantId = tenant.GetRequiredId(),
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			ScheduledAtUtc = DateTime.UtcNow.AddHours(2),
			ScheduledTimeZone = TimeZoneInfo.Local.Id,
			IdempotencyKey = Lib.PublicationIdempotencyKey.For(id),
		});
		await db.SaveChangesAsync();
		return new Seeded(post.GetRequiredId(), id, account.GetRequiredId(), handle);
	}
}
