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
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindPublicationsForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _PublicationsUrl {
		get {
			return "/publishing/publications";
		}
	}

	[Fact]
	public async Task ItShouldListNewestFirstWithExcerptLabelAndWireStatus() {
		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get, FindPublicationsForTenantSpec._PublicationsUrl
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);

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
				"scheduled", "in_progress", "published", "failed", "paused"
			);
			item.PostExcerpt.Length.Should().BeLessThanOrEqualTo(280);
			item.PostId.Should().NotBeEmpty();
			item.SocialAccountId.Should().NotBeEmpty();
			item.AccountLabel.Should().NotBeNullOrEmpty();
		}
	}

	[Fact]
	public async Task ItShouldSurfaceFailedRowCauseAndExternalLinkVerbatim() {
		await this._SeedPublishedAndFailedRowsAsync();

		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindPublicationsForTenantSpec._PublicationsUrl + "?status=failed,published"
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
		Assert.NotNull(payload);

		var failed = payload.Data.Single(item => item.Status == "failed");
		failed.LastError.Should().Be(
			"Bluesky refused the record: rate limit exceeded",
			"the sanitised cause is surfaced verbatim"
		);
		failed.ExternalUrl.Should().BeNull("a failed row never went out");
		failed.FailureCategory.Should().Be("unknown", "an unclassified failure reads as unknown");
		failed.Attempts.Should().Be(1);
		failed.AccountUsable.Should().BeTrue();
		failed.Superseded.Should().BeFalse();

		var published = payload.Data.Single(item => item.Status == "published");
		published.ExternalUrl.Should()
			.Contain("bsky.app", "the published row links to Bluesky");
	}

	[Fact]
	public async Task ItShouldHideForeignTenantRowsCompletely() {
		await this._SeedForeignTenantPublicationAsync();
		var foreignCount = await this._CountRowsAsync(tenantIsAcme: false);

		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get, FindPublicationsForTenantSpec._PublicationsUrl + "?limit=100"
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content
			.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
		Assert.NotNull(payload);
		payload.Data.Should().NotContain(item => item.AccountLabel == "@foreign.bsky.social");
		foreignCount.Should().BeGreaterThanOrEqualTo(1);
	}

	[Fact]
	public async Task ItShouldReturn422ForUnknownStatusTokenUnderStableKey() {
		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get, FindPublicationsForTenantSpec._PublicationsUrl + "?status=bogus"
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("status");
	}

	[Fact]
	public async Task ItShouldPaginateWithCursorUntilExhausted() {
		var seeded = await this._SeedScheduledRowsAsync(3);
		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();

		var seenIds = new List<Guid>();
		string? cursor = null;
		for (var page = 0; page < 10; page++) {
			var url = FindPublicationsForTenantSpec._PublicationsUrl
				+ "?status=scheduled&limit=2"
				+ (cursor is null ? "" : "&cursor=" + cursor);
			using var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(acmeToken).WithTenantId(acmeId);
			using var response = await this._Http.SendAsync(request);

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

	[Fact]
	public async Task ItShouldNotShowSegmentsAddedAfterPublishingAsPendingOnAPublishedThread() {
		// One post per row: follow-ups are per post.
		var ids = new List<Guid> {
			(await this._SeedScheduledRowsAsync(1))[0],
			(await this._SeedScheduledRowsAsync(1))[0],
		};
		var tenantId = await this._PublishWithSegmentsAsync(ids[0], publishedSegments: 3);
		await this._PublishWithSegmentsAsync(ids[1], publishedSegments: 0);
		// The thread had two follow-ups when it went out; two more arrive afterwards.
		await this._AddFollowUpsAfterwardsAsync(ids[0], tenantId, count: 2, startAt: 1);
		await this._AddFollowUpsAfterwardsAsync(ids[0], tenantId, count: 2, startAt: 3);
		await this._AddFollowUpsAfterwardsAsync(ids[1], tenantId, count: 2, startAt: 1);

		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get, FindPublicationsForTenantSpec._PublicationsUrl + "?status=published&limit=100"
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
		Assert.NotNull(payload);
		var thread = payload.Data.Single(item => item.Id == ids[0]);
		thread.SegmentsPublished.Should().Be(3);
		thread.SegmentsTotal.Should().Be(3, "segments added after publishing belong to no publication yet");
		var single = payload.Data.Single(item => item.Id == ids[1]);
		single.SegmentsTotal.Should().Be(1, "a published single post stays a single post in history");
	}

	[Fact]
	public async Task ItShouldKeepCountingEverySegmentForAPublicationThatHasNotPublishedYet() {
		var ids = await this._SeedScheduledRowsAsync(1);
		var tenantId = await this._PublishWithSegmentsAsync(ids[0], publishedSegments: -1);
		await this._AddFollowUpsAfterwardsAsync(ids[0], tenantId, count: 2, startAt: 1);

		var (acmeId, acmeToken) = await this._LoginAsAcmeAdminAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get, FindPublicationsForTenantSpec._PublicationsUrl + "?status=scheduled&limit=100"
		).WithSessionToken(acmeToken).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);

		var payload = await response.Content.ReadFromJsonAsync<FindPublicationsForTenantResponse>();
		Assert.NotNull(payload);
		payload.Data.Single(item => item.Id == ids[0]).SegmentsTotal.Should().Be(3);

		// Leave no Scheduled row behind: other specs page through the scheduled ones.
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var transitions = new PublicationStatusTransitionService(
			scope.ServiceProvider.GetRequiredService<AppDbContext>()
		);
		await transitions.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(ids[0], tenantId), CancellationToken.None
		);
		await transitions.MarkFailedAsync(
			new MarkPublicationFailedArgs(ids[0], tenantId, "spec cleanup"), CancellationToken.None
		);
	}

	// Publishes the row through the transition service (never assigning Status) with
	// `publishedSegments` stored results; a negative count leaves it Scheduled.
	private async Task<Guid> _PublishWithSegmentsAsync(Guid publicationId, int publishedSegments) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var publication = await db.Publication.AsNoTracking().SingleAsync(row => row.Id == publicationId);
		for (var position = 0; position < publishedSegments; position++) {
			db.PublicationSegmentResult.Add(new PublicationSegmentResult {
				TenantId = publication.TenantId,
				PublicationId = publicationId,
				SegmentPosition = position,
				ExternalRecordId = $"at://did.example/app.bsky.feed.post/s{position}",
				ExternalCid = $"cid-{position}",
				ExternalUrl = $"https://bsky.app/s{position}",
			});
		}

		await db.SaveChangesAsync();
		if (publishedSegments >= 0) {
			var transitions = new PublicationStatusTransitionService(db);
			await transitions.MarkInProgressAsync(
				new MarkPublicationInProgressArgs(publicationId, publication.TenantId), CancellationToken.None
			);
			await transitions.MarkPublishedAsync(
				new MarkPublicationPublishedArgs(
					publicationId, publication.TenantId, "at://did.example/app.bsky.feed.post/s0", "https://bsky.app/s0"
				),
				CancellationToken.None
			);
		}

		return publication.TenantId;
	}

	private async Task _AddFollowUpsAfterwardsAsync(Guid publicationId, Guid tenantId, int count, int startAt) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var postId = (await db.Publication.AsNoTracking().SingleAsync(row => row.Id == publicationId)).PostId;
		for (var index = 0; index < count; index++) {
			db.PostSegment.Add(new global::PublyApp.Api.Modules.Posts.Entities.PostSegment {
				TenantId = tenantId,
				PostId = postId,
				Position = startAt + index,
				Body = $"added later {index}",
			});
		}

		await db.SaveChangesAsync();
	}

	// ── helpers ────────────────────────────────────────────────────────

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

	private async Task<int> _CountRowsAsync(bool tenantIsAcme) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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

	private static async Task<Guid> _SeedAccountAsync(
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

	private async Task<List<Guid>> _SeedScheduledRowsAsync(int count) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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
			var accountId = await FindPublicationsForTenantSpec._SeedAccountAsync(
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

	private async Task _SeedPublishedAndFailedRowsAsync() {
		var ids = await this._SeedScheduledRowsAsync(2);
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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
				"https://bsky.app/role/did.example/post/hist1"
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

	private async Task _SeedForeignTenantPublicationAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
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
		var accountId = await FindPublicationsForTenantSpec._SeedAccountAsync(
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
