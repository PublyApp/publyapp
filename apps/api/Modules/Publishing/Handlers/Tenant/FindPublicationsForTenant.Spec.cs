using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// HTTP-level integration spec for GET /publishing/publications (D2 Task 3).
// Statuses other than Scheduled are reached ONLY through
// PublicationStatusTransitionService — this spec never assigns Status directly.
public sealed class FindPublicationsForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindPublicationsForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string PublicationsUrl {
		get {
			return "/publishing/publications";
		}
	}

	[Fact]
	public async Task ItShouldListNewestFirstWithExcerptLabelAndWireStatus() {
		var (acmeId, acmeToken) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get, PublicationsUrl
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);

		payload.Data.Should().OnlyHaveUniqueItems(item => item.Id);

		DateTime? previous = null;
		foreach (var item in payload.Data) {
			if (previous.HasValue) {
				item.UpdatedAt.Should().BeOnOrBefore(previous.Value);
			}
			previous = item.UpdatedAt;

			item.Status.Should().BeOneOf(
				PublicationContractStatus.scheduled,
				PublicationContractStatus.in_progress,
				PublicationContractStatus.published,
				PublicationContractStatus.failed,
				PublicationContractStatus.paused
			);
			item.PostExcerpt.Length.Should().BeLessThanOrEqualTo(280);
			item.PostId.Should().NotBeEmpty();
			item.SocialAccountId.Should().NotBeEmpty();
			item.AccountLabel.Should().NotBeNullOrEmpty();
		}
	}

	[Fact]
	public async Task ItShouldSurfaceFailedRowCauseAndExternalLinkVerbatim() {
		await SeedPublishedAndFailedRowsAsync();

		var (acmeId, acmeToken) = await LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PublicationsUrl + "?status=failed,published"
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
		Assert.NotNull(payload);

		var failed = payload.Data.Single(item => item.Status == PublicationContractStatus.failed);
		failed.LastError.Should().Be(
			"Bluesky refused the record: rate limit exceeded",
			"the sanitised cause is surfaced verbatim"
		);
		failed.ExternalUrl.Should().BeNull("a failed row never went out");

		var published = payload.Data.Single(item => item.Status == PublicationContractStatus.published);
		published.ExternalUrl.Should()
			.Contain("bsky.app", "the published row links to Bluesky");
	}

	[Fact]
	public async Task ItShouldHideForeignTenantRowsCompletely() {
		await SeedForeignTenantPublicationAsync();
		var foreignCount = await CountRowsAsync(tenantIsAcme: false);

		var (acmeId, acmeToken) = await LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get, PublicationsUrl + "?limit=100"
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
		Assert.NotNull(payload);
		payload.Data.Should().NotContain(item => item.AccountLabel == "@foreign.bsky.social");
		foreignCount.Should().BeGreaterThanOrEqualTo(1);
	}

	[Fact]
	public async Task ItShouldReturn422ForUnknownStatusTokenUnderStableKey() {
		var (acmeId, acmeToken) = await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get, PublicationsUrl + "?status=bogus"
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("status");
	}

	[Fact]
	public async Task ItShouldPaginateWithCursorUntilExhausted() {
		var seeded = await SeedScheduledRowsAsync(3);
		var (acmeId, acmeToken) = await LoginAsAcmeAdminAsync();

		var seenIds = new List<Guid>();
		string? cursor = null;
		for (var page = 0; page < 10; page++) {
			var url = PublicationsUrl
				+ "?status=scheduled&limit=2"
				+ (cursor is null ? "" : "&cursor=" + cursor);
			using var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(acmeToken).WithTenantId(acmeId);
			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
			var payload = await response.Content
				.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
			Assert.NotNull(payload);

			seenIds.AddRange(payload.Data.Select(item => item.Id));
			if (payload.NextCursor is null) {
				break;
			}
			cursor = payload.NextCursor;
		}

		seenIds.Should().BeEquivalentTo(seeded);
	}

	// ── helpers ────────────────────────────────────────────────────────

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

	private async Task<int> CountRowsAsync(bool tenantIsAcme) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var acmeName = SeedConstants.Tenants.AcmeName;
		return await (
			from publication in db.Publication.AsNoTracking()
			where tenantIsAcme
				? publication.Tenant.Name == acmeName
				: publication.Tenant.Name != acmeName
			select publication
		).CountAsync();
	}

	private static async Task<Guid> SeedAccountAsync(
		AppDbContext db,
		Guid tenantId,
		string handle
	) {
		var account = new global::PublyApp.Api.Modules.SocialAccounts
			.Entities.SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = handle,
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private async Task<List<Guid>> SeedScheduledRowsAsync(int count) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var acmeName = SeedConstants.Tenants.AcmeName;
		var tenant = await db.Tenant
			.Where(t => t.Name == acmeName)
			.SingleAsync();
		var user = await db.User
			.Where(u => u.Email == TestConstants.AcmeAdminEmail)
			.SingleAsync();
		var post = new global::PublyApp.Api.Modules.Posts.Entities.Post {
			TenantId = tenant.GetRequiredId(),
			Body = "history spec post " + Guid.NewGuid().ToString("N"),
			CreatedByUserId = user.GetRequiredId(),
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();

		var ids = new List<Guid>();
		for (var index = 0; index < count; index++) {
			var accountId = await SeedAccountAsync(
				db, tenant.GetRequiredId(), $"@history-{index}.bsky.social"
			);
			var id = Guid.CreateVersion7();
			db.Publication.Add(new Publication {
				TenantId = tenant.GetRequiredId(),
				PostId = post.GetRequiredId(),
				SocialAccountId = accountId,
				ScheduledAtUtc = DateTime.UtcNow,
				ScheduledTimeZone = TimeZoneInfo.Local.Id,
				IdempotencyKey =
					global::PublyApp.Api.Modules.Publishing.Lib
						.PublicationIdempotencyKey.For(id),
				Id = id,
			});
			ids.Add(id);
		}

		await db.SaveChangesAsync();
		return ids;
	}

	private async Task SeedPublishedAndFailedRowsAsync() {
		var ids = await SeedScheduledRowsAsync(2);
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var acmeName = SeedConstants.Tenants.AcmeName;
		var tenantId = (await db.Tenant
			.Where(t => t.Name == acmeName)
			.SingleAsync()).GetRequiredId();

		var transitions = new PublicationStatusTransitionService(db);
		await transitions.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(ids[0], tenantId),
			CancellationToken.None
		);
		await transitions.MarkPublishedAsync(
			new MarkPublicationPublishedArgs(
				ids[0],
				tenantId,
				"at://did.example/app.bsky.feed.post/hist1",
				"https://bsky.app/profile/did.example/post/hist1"
			),
			CancellationToken.None
		);
		await transitions.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(ids[1], tenantId),
			CancellationToken.None
		);
		await transitions.MarkFailedAsync(
			new MarkPublicationFailedArgs(
				ids[1],
				tenantId,
				"Bluesky refused the record: rate limit exceeded"
			),
			CancellationToken.None
		);
	}

	private async Task SeedForeignTenantPublicationAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var techStartName = SeedConstants.Tenants.TechStartName;
		var tenant = await db.Tenant
			.Where(t => t.Name == techStartName)
			.SingleAsync();
		var user = await db.User
			.Where(u => u.Email == TestConstants.TechStartAdminEmail)
			.SingleAsync();
		var post = new global::PublyApp.Api.Modules.Posts.Entities.Post {
			TenantId = tenant.GetRequiredId(),
			Body = "foreign history spec post",
			CreatedByUserId = user.GetRequiredId(),
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();
		var accountId = await SeedAccountAsync(
			db, tenant.GetRequiredId(), "@foreign.bsky.social"
		);
		var id = Guid.CreateVersion7();
		db.Publication.Add(new Publication {
			TenantId = tenant.GetRequiredId(),
			PostId = post.GetRequiredId(),
			SocialAccountId = accountId,
			ScheduledAtUtc = DateTime.UtcNow,
			ScheduledTimeZone = TimeZoneInfo.Local.Id,
			IdempotencyKey =
				global::PublyApp.Api.Modules.Publishing.Lib
					.PublicationIdempotencyKey.For(id),
			Id = id,
		});
		await db.SaveChangesAsync();
	}
}
