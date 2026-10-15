using System.Net;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Jobs;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// HTTP-level integration spec for POST /posts/publications/{id}/retry (#647).
// Bluesky is never touched: the endpoint stops at the trusted enqueue boundary.
public sealed class RetryPublicationForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public RetryPublicationForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldRetryAFailedPublicationOnceWithTheSameKeyAndResetTheCounter() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedAsync(
			acmeId, PublicationStatus.Failed, PublicationFailureCategory.RetryLater, attempts: 3
		);
		var sibling = await this._SeedSiblingAsync(seeded.PostId, acmeId, PublicationStatus.Published);

		using var first = await this._RetryAsync(token, acmeId, seeded.PublicationId);
		using var second = await this._RetryAsync(token, acmeId, seeded.PublicationId);

		first.StatusCode.Should().Be(HttpStatusCode.OK);
		second.StatusCode.Should().Be(
			HttpStatusCode.Conflict, "a double click finds the row already re-queued"
		);
		await RetryPublicationForTenantSpec._AssertProblemKeyAsync(second, "publication-retry-not-allowed");

		(await this._JobCountAsync(seeded.IdempotencyKey)).Should().Be(
			1, "one retry, one job"
		);
		var publication = await this._LoadAsync(seeded.PublicationId);
		publication.Status.Should().Be(PublicationStatus.Scheduled);
		publication.Attempts.Should().Be(0);
		publication.IdempotencyKey.Should().Be(seeded.IdempotencyKey);
		publication.LastError.Should().NotBeNullOrWhiteSpace(
			"the previous cause stays until the new attempt starts"
		);

		var siblingAfter = await this._LoadAsync(sibling);
		siblingAfter.Status.Should().Be(PublicationStatus.Published, "siblings are never touched");
	}

	[Fact]
	public async Task ItShouldEnqueueASingleJobWhenTwoRetriesRaceEachOther() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedAsync(
			acmeId, PublicationStatus.Failed, PublicationFailureCategory.Unknown, attempts: 1
		);

		var responses = await Task.WhenAll(
			this._RetryAsync(token, acmeId, seeded.PublicationId),
			this._RetryAsync(token, acmeId, seeded.PublicationId)
		);

		try {
			responses.Count(r => r.StatusCode == HttpStatusCode.OK).Should().Be(1);
			responses.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(1);
			(await this._JobCountAsync(seeded.IdempotencyKey)).Should().Be(1);
		} finally {
			foreach (var response in responses) {
				response.Dispose();
			}
		}
	}

	[Fact]
	public async Task ItShouldRetryAPausedPublicationOnceTheAccountIsActiveAgain() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedAsync(
			acmeId, PublicationStatus.Paused, PublicationFailureCategory.Reconnect
		);

		using var response = await this._RetryAsync(token, acmeId, seeded.PublicationId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._LoadAsync(seeded.PublicationId)).Status
			.Should().Be(PublicationStatus.Scheduled);
		(await this._JobCountAsync(seeded.IdempotencyKey)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRefusePausedRetryWhileTheAccountNeedsReconnect() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedAsync(
			acmeId,
			PublicationStatus.Paused,
			PublicationFailureCategory.Reconnect,
			accountStatus: SocialAccountStatus.NeedsReconnect
		);

		using var response = await this._RetryAsync(token, acmeId, seeded.PublicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		await RetryPublicationForTenantSpec._AssertProblemKeyAsync(response, "publication-retry-reconnect-first");
		(await this._LoadAsync(seeded.PublicationId)).Status
			.Should().Be(PublicationStatus.Paused);
		(await this._JobCountAsync(seeded.IdempotencyKey)).Should().Be(0);
	}

	[Theory]
	[InlineData(PublicationStatus.Published)]
	[InlineData(PublicationStatus.Scheduled)]
	[InlineData(PublicationStatus.InProgress)]
	public async Task ItShouldRefuseRetryFromAnyOtherStatus(PublicationStatus status) {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedAsync(acmeId, status, null);

		using var response = await this._RetryAsync(token, acmeId, seeded.PublicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		await RetryPublicationForTenantSpec._AssertProblemKeyAsync(response, "publication-retry-not-allowed");
		(await this._LoadAsync(seeded.PublicationId)).Status.Should().Be(status);
		(await this._JobCountAsync(seeded.IdempotencyKey)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldRefuseRetryOfASupersededPublicationOfAnyStatus() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var failed = await this._SeedAsync(acmeId, PublicationStatus.Failed, PublicationFailureCategory.Unknown);
		var newer = await this._SeedSiblingAsync(
			failed.PostId, acmeId, PublicationStatus.Scheduled, failed.SocialAccountId
		);

		using var response = await this._RetryAsync(token, acmeId, failed.PublicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		await RetryPublicationForTenantSpec._AssertProblemKeyAsync(response, "publication-retry-superseded");
		(await this._LoadAsync(failed.PublicationId)).Status.Should().Be(PublicationStatus.Failed);
		(await this._LoadAsync(newer)).Status.Should().Be(PublicationStatus.Scheduled);
		(await this._JobCountAsync(failed.IdempotencyKey)).Should().Be(0);
	}

	// A fails at segment 3, B inherits A's progress and fails at segment 4: retrying A
	// would post segment 3 a second time under A's own record keys, so only B retries.
	[Fact]
	public async Task ItShouldOnlyRetryTheNewestOfTwoFailedPublicationsOfTheSamePair() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var older = await this._SeedAsync(acmeId, PublicationStatus.Failed, PublicationFailureCategory.RetryLater);
		var newer = await this._SeedSiblingAsync(
			older.PostId, acmeId, PublicationStatus.Failed, older.SocialAccountId
		);
		await this._AddSegmentResultsAsync(older.PublicationId, acmeId, 2);
		await this._AddSegmentResultsAsync(newer, acmeId, 3);

		using var olderResponse = await this._RetryAsync(token, acmeId, older.PublicationId);
		using var newerResponse = await this._RetryAsync(token, acmeId, newer);

		olderResponse.StatusCode.Should().Be(HttpStatusCode.Conflict);
		await RetryPublicationForTenantSpec._AssertProblemKeyAsync(olderResponse, "publication-retry-superseded");
		newerResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._LoadAsync(older.PublicationId)).Status.Should().Be(PublicationStatus.Failed);
	}

	// #2180: cancelling a Scheduled thread row that already published segments
	// soft-deletes it, keeping its results. That newer, hidden row holds MORE progress
	// than the older Failed row, so retrying the older one must still be refused.
	[Fact]
	public async Task ItShouldRefuseRetryWhenTheNewerRowWasCancelledButKeepsThreadProgress() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var older = await this._SeedAsync(acmeId, PublicationStatus.Failed, PublicationFailureCategory.RetryLater);
		var cancelled = await this._SeedSiblingAsync(
			older.PostId, acmeId, PublicationStatus.Scheduled, older.SocialAccountId
		);
		await this._AddSegmentResultsAsync(older.PublicationId, acmeId, 2);
		await this._AddSegmentResultsAsync(cancelled, acmeId, 3);
		await this._SoftDeleteAsync(cancelled);

		using var response = await this._RetryAsync(token, acmeId, older.PublicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		await RetryPublicationForTenantSpec._AssertProblemKeyAsync(response, "publication-retry-superseded");
		(await this._LoadAsync(older.PublicationId)).Status.Should().Be(PublicationStatus.Failed);
		(await this._JobCountAsync(older.IdempotencyKey)).Should().Be(0);
	}

	private async Task _AddSegmentResultsAsync(Guid publicationId, Guid tenantId, int count) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		for (var position = 0; position < count; position++) {
			db.PublicationSegmentResult.Add(new PublicationSegmentResult {
				TenantId = tenantId,
				PublicationId = publicationId,
				SegmentPosition = position,
				ExternalRecordId = $"at://did:plc:x/app.bsky.feed.post/{publicationId:N}-{position}",
				ExternalCid = $"cid-{position}",
				ExternalUrl = $"https://bsky.app/profile/x/post/{publicationId:N}-{position}",
			});
		}

		await db.SaveChangesAsync();
	}

	private async Task _SoftDeleteAsync(Guid publicationId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var publication = await db.Publication.SingleAsync(p => p.Id == publicationId);
		publication.IsDeleted = true;
		publication.DeletedAt = DateTime.UtcNow;
		await db.SaveChangesAsync();
	}

	[Theory]
	[InlineData(PublicationStatus.Paused, SocialAccountStatus.Revoked)]
	[InlineData(PublicationStatus.Failed, SocialAccountStatus.Revoked)]
	[InlineData(PublicationStatus.Failed, SocialAccountStatus.NeedsReconnect)]
	public async Task ItShouldRefuseRetryWhileTheAccountIsNotActive(
		PublicationStatus status,
		SocialAccountStatus accountStatus
	) {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var seeded = await this._SeedAsync(
			acmeId, status, PublicationFailureCategory.Reconnect, accountStatus: accountStatus
		);

		using var response = await this._RetryAsync(token, acmeId, seeded.PublicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		await RetryPublicationForTenantSpec._AssertProblemKeyAsync(response, "publication-retry-reconnect-first");
		(await this._LoadAsync(seeded.PublicationId)).Status.Should().Be(status);
		(await this._JobCountAsync(seeded.IdempotencyKey)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturn404ForAnotherTenantsPublicationAndAnUnknownId() {
		var (acmeId, token) = await this._LoginAsAcmeAdminAsync();
		var foreign = await this._SeedTechStartFailedAsync();

		using var foreignResponse = await this._RetryAsync(token, acmeId, foreign);
		using var unknown = await this._RetryAsync(token, acmeId, Guid.CreateVersion7());

		foreignResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
		unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
		(await this._LoadAsync(foreign)).Status.Should().Be(PublicationStatus.Failed);
	}

	[Fact]
	public async Task ItShouldRequireAnAuthenticatedTenantCaller() {
		var acmeId = (await this._LoginAsAcmeAdminAsync()).TenantId;
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			$"/posts/publications/{Guid.CreateVersion7()}/retry"
		).WithTenantId(acmeId);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	// ── helpers ────────────────────────────────────────────────────────

	private sealed record Seeded(
		Guid PublicationId,
		Guid PostId,
		Guid SocialAccountId,
		string IdempotencyKey
	);

	private async Task<HttpResponseMessage> _RetryAsync(
		string token,
		Guid tenantId,
		Guid publicationId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post, $"/posts/publications/{publicationId}/retry"
		).WithSessionToken(token).WithTenantId(tenantId);
		return await this._Http.SendAsync(request);
	}

	private static async Task _AssertProblemKeyAsync(HttpResponseMessage response, string key) {
		using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
		problem.RootElement.GetProperty("translationKey").GetString().Should().Be(key);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Seeded> _SeedAsync(
		Guid tenantId,
		PublicationStatus status,
		PublicationFailureCategory? category,
		int attempts = 0,
		SocialAccountStatus accountStatus = SocialAccountStatus.Active
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var userId = await db.User
			.Where(user => user.Email == TestConstants.AcmeAdminEmail)
			.Select(user => user.GetRequiredId())
			.SingleAsync();
		var post = new Post {
			TenantId = tenantId,
			Body = "retry endpoint spec " + Guid.NewGuid().ToString("N"),
			CreatedByUserId = userId,
		};
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@retry-endpoint.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
			Status = accountStatus,
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var publicationId = await RetryPublicationForTenantSpec._AddPublicationAsync(
			db, tenantId, post.GetRequiredId(), account.GetRequiredId(), status, category, attempts
		);
		var key = PublicationIdempotencyKey.For(publicationId);
		return new Seeded(publicationId, post.GetRequiredId(), account.GetRequiredId(), key);
	}

	// A second publication of the same post: another account unless one is given.
	private async Task<Guid> _SeedSiblingAsync(
		Guid postId,
		Guid tenantId,
		PublicationStatus status,
		Guid? accountId = null
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var targetAccountId = accountId;
		if (targetAccountId is null) {
			var account = new SocialAccount {
				TenantId = tenantId,
				ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
				DisplayHandle = "@retry-sibling.bsky.social",
				ProtectedCredentials = "enc-spec-blob",
			};
			db.SocialAccount.Add(account);
			await db.SaveChangesAsync();
			targetAccountId = account.GetRequiredId();
		}

		return await RetryPublicationForTenantSpec._AddPublicationAsync(
			db, tenantId, postId, targetAccountId.Value, status, null, 0
		);
	}

	private static async Task<Guid> _AddPublicationAsync(
		AppDbContext db,
		Guid tenantId,
		Guid postId,
		Guid accountId,
		PublicationStatus status,
		PublicationFailureCategory? category,
		int attempts
	) {
		var id = Guid.CreateVersion7();
		var publication = new Publication {
			TenantId = tenantId,
			PostId = postId,
			SocialAccountId = accountId,
			Status = status,
			FailureCategory = category,
			Attempts = attempts,
			LastError = category is null ? null : "the provider did not answer",
			ScheduledAtUtc = DateTime.UtcNow.AddMinutes(-5),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = PublicationIdempotencyKey.For(id),
		};
		publication.Id = id;
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return id;
	}

	private async Task<Guid> _SeedTechStartFailedAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var techId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.TechStartName
		);
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var userId = await db.User
			.Where(user => user.Email == TestConstants.TechStartAdminEmail)
			.Select(user => user.GetRequiredId())
			.SingleAsync();
		var post = new Post {
			TenantId = techId,
			Body = "foreign retry spec post",
			CreatedByUserId = userId,
		};
		var account = new SocialAccount {
			TenantId = techId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@retry-foreign.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return await RetryPublicationForTenantSpec._AddPublicationAsync(
			db, techId, post.GetRequiredId(), account.GetRequiredId(),
			PublicationStatus.Failed, PublicationFailureCategory.Unknown, 1
		);
	}

	private async Task<Publication> _LoadAsync(Guid publicationId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.Publication.AsNoTracking().SingleAsync(p => p.Id == publicationId);
	}

	private async Task<int> _JobCountAsync(string idempotencyKey) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.JobQueue
			.Where(job => job.JobType == PublishingJobs.PublishPublicationV1JobType)
			.Where(job => job.IdempotencyKey == idempotencyKey)
			.CountAsync();
	}
}
