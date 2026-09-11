using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// Integration spec for the tenant cancel-schedule endpoint (D3 Task 3). Cancel
// hard-deletes ONLY Scheduled publications (SQL DELETE); InProgress/Paused/
// Published rows are kept, and a post left without any publication derives back
// to Draft.
public sealed class CancelPostScheduleForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CancelPostScheduleForTenantSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
		_Http.DefaultRequestHeaders.Accept.Clear();
		_Http.DefaultRequestHeaders.Accept.Add(
			new MediaTypeWithQualityHeaderValue("application/json")
		);
	}

	private static string _ScheduleUrl(string postId) {
		return $"/posts/{postId}/schedule";
	}

	private const string _ParisZone = "Europe/Paris";

	[Fact]
	public async Task ItShouldDeleteScheduledPublicationsAndReturnToDraft() {
		var (tenantId, token, postId, publicationIds) =
			await _SeedScheduledPostWithIdsAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Delete, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new { });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload =
			await response.Content.ReadFromJsonAsync<ApiResponse>();
		Assert.NotNull(payload);
		payload.Key.Should().Be("post-schedule-cancelled-success");

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var remaining = await (
			from p in db.Publication.IgnoreQueryFilters().AsNoTracking()
			where p.PostId == Guid.Parse(postId)
			select p
		).ToListAsync();
		remaining.Should().BeEmpty(
			"cancel is a hard DELETE: even soft-deleted rows must not remain"
		);

		// No publication left -> the post derives back to Draft.
		PostStatusDerivation.Derive(remaining)
			.Should().Be(DerivedPostStatus.Draft);

		var audits = await (
			from entry in db.AuditLog.AsNoTracking()
			where entry.TargetId == Guid.Parse(postId)
				&& entry.Action == AuditActions.PublicationScheduleCancelled
			select entry.Details
		).ToListAsync();
		audits.Should().ContainSingle();
		audits.Single().Should().Contain("2");

		_ = publicationIds; // ids asserted indirectly by the empty-table check
	}

	[Fact]
	public async Task ItShouldReturnNoopWhenNothingIsScheduled() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		await using var setupScope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var setupDb =
			setupScope.ServiceProvider.GetRequiredService<AppDbContext>();
		await setupDb.Publication
			.Where(p => p.PostId == Guid.Parse(postId))
			.ExecuteDeleteAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Delete, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload =
			await response.Content.ReadFromJsonAsync<ApiResponse>();
		Assert.NotNull(payload);
		payload.Key.Should().Be("post-schedule-cancel-noop");
	}

	[Fact]
	public async Task ItShouldKeepNonScheduledRowsAndStateTheKeptCount() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		// One row is mid-flight (InProgress): cancel keeps it and deletes the
		// Scheduled siblings. Seeded as a tracked insert (the #1446 guard permits
		// Status on Added rows; only raw/unstamped Status UPDATEs are rejected).
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var sample = await db.Publication
			.AsNoTracking()
			.Where(p => p.PostId == Guid.Parse(postId)
				&& p.TenantId == tenantId)
			.OrderBy(p => p.Id)
			.FirstAsync();

		// Distinct account so the InProgress row satisfies ux_publications_post_account.
		var inFlightAccount = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@cancel.inflight." + Guid.NewGuid().ToString("N")[..5]
				+ ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(inFlightAccount);
		await db.SaveChangesAsync();

		db.Publication.Add(new Publication {
			TenantId = tenantId,
			PostId = sample.PostId,
			SocialAccountId = inFlightAccount.GetRequiredId(),
			Status = PublicationStatus.InProgress,
			ScheduledAtUtc = sample.ScheduledAtUtc,
			ScheduledTimeZone = sample.ScheduledTimeZone,
			IdempotencyKey = "in-progress-seed",
		});
		await db.SaveChangesAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Delete, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);
		request.Content = JsonContent.Create(new { });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload =
			await response.Content.ReadFromJsonAsync<ApiResponse>();
		Assert.NotNull(payload);
		payload.Message.Should().Contain("1");
		payload.Message.Should().ContainAny("kept", "still", "not");

		await using var verifyScope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var verifyDb =
			verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var remaining = await (
			from p in verifyDb.Publication.AsNoTracking()
			where p.PostId == Guid.Parse(postId) && !p.IsDeleted
			select p
		).ToListAsync();
		remaining.Should().ContainSingle();
		remaining.Single().Status.Should().Be(PublicationStatus.InProgress);
	}

	[Fact]
	public async Task ItShouldReturn403WithoutPostsPublishPermission() {
		var tenantId = await _GetAcmeIdAsync();
		var postId = await _CreateScheduledPostAsync(tenantId);

		var userToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request =
			new HttpRequestMessage(HttpMethod.Delete, _ScheduleUrl(postId))
				.WithSessionToken(userToken)
				.WithTenantId(tenantId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturn400WhenPostIdIsMalformed() {
		var (tenantId, token, _) = await _SeedScheduledPostAsync();

		using var request =
			new HttpRequestMessage(HttpMethod.Delete, _ScheduleUrl("not-a-guid"))
				.WithSessionToken(token)
				.WithTenantId(tenantId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturn404ForUnknownAndCrossTenantPostIds() {
		var (acmeTenantId, acmeToken, postId) =
			await _SeedScheduledPostAsync();
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var techStartId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);

		using var unknownRequest =
			new HttpRequestMessage(
				HttpMethod.Delete,
				_ScheduleUrl(Guid.NewGuid().ToString())
			)
				.WithSessionToken(acmeToken)
				.WithTenantId(acmeTenantId);
		using var unknownResponse = await _Http.SendAsync(unknownRequest);
		unknownResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);

		var techStartToken = await _AuthClient.LoginAsync(
			TestConstants.TechStartAdminEmail,
			TestConstants.SeedPassword
		);
		using var foreignRequest =
			new HttpRequestMessage(HttpMethod.Delete, _ScheduleUrl(postId))
				.WithSessionToken(techStartToken)
				.WithTenantId(techStartId);
		using var foreignResponse = await _Http.SendAsync(foreignRequest);
		foreignResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturn404ForSoftDeletedPosts() {
		var (tenantId, token, postId) = await _SeedScheduledPostAsync();

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await db.Post
			.Where(p => p.Id == Guid.Parse(postId))
			.ExecuteUpdateAsync(s => s
				.SetProperty(p => p.IsDeleted, true)
				.SetProperty(p => p.DeletedAt, DateTime.UtcNow));

		using var request =
			new HttpRequestMessage(HttpMethod.Delete, _ScheduleUrl(postId))
				.WithSessionToken(token)
				.WithTenantId(tenantId);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<(Guid TenantId, string Token, string PostId)>
	_SeedScheduledPostAsync() {
		var tenantId = await _GetAcmeIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var postId = await _CreateScheduledPostAsync(tenantId);
		return (tenantId, token, postId);
	}

	private async Task<
		(Guid TenantId, string Token, string PostId, List<Guid> PublicationIds)>
	_SeedScheduledPostWithIdsAsync() {
		var tenantId = await _GetAcmeIdAsync();
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var postId = await _CreateScheduledPostAsync(tenantId);

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var publicationIds = await (
			from p in db.Publication.AsNoTracking()
			where p.PostId == Guid.Parse(postId)
			orderby p.Id
			select p.GetRequiredId()
		).ToListAsync();

		return (tenantId, token, postId, publicationIds);
	}

	/// <summary>
	/// Seeds an Acme post bound to two Scheduled publications (future instants) and
	/// returns the persisted post id plus the two publication ids.
	/// </summary>
	private async Task<string> _CreateScheduledPostAsync(Guid tenantId) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var author = await db.User.AsNoTracking().SingleAsync(
			u => u.Email == TestConstants.AcmeAdminEmail
		);

		var post = new Modules.Posts.Entities.Post {
			TenantId = tenantId,
			Body = "scheduled body awaiting cancellation",
			CreatedByUserId = author.GetRequiredId(),
		};
		db.Post.Add(post);
		var firstAccount = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@cancel.a." + Guid.NewGuid().ToString("N")[..5]
				+ ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		var secondAccount = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
			DisplayHandle = "@cancel.b." + Guid.NewGuid().ToString("N")[..5]
				+ ".bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.AddRange(firstAccount, secondAccount);
		await db.SaveChangesAsync();

		foreach (var account in new[] { firstAccount, secondAccount }) {
			db.Publication.Add(new Publication {
				TenantId = tenantId,
				PostId = post.GetRequiredId(),
				SocialAccountId = account.GetRequiredId(),
				Status = PublicationStatus.Scheduled,
				ScheduledAtUtc = DateTime.UtcNow.AddDays(30),
				ScheduledTimeZone = _ParisZone,
				IdempotencyKey = "pending",
			});
		}
		await db.SaveChangesAsync();

		return post.GetRequiredId().ToString();
	}

	private async Task<Guid> _GetAcmeIdAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}
}
