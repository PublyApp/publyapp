using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// Integration spec for GET /posts/{postId}/publications (#2208). Real ephemeral Postgres.
// Rows are seeded directly (this spec is on the status-write allowlist).
public sealed class FindPostPublicationsForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindPostPublicationsForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.Factory.CreateClient(
			new WebApplicationFactoryClientOptions { HandleCookies = false }
		);
		this._AuthClient = new TestAuthClient(this._Http);
		this._Http.DefaultRequestHeaders.Accept.Clear();
		this._Http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
	}

	private async Task<Guid> _TenantIdAsync(string name) {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(this._Http, staffToken, name);
	}

	private Task<string> _AdminTokenAsync() {
		return this._AuthClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword);
	}

	// A post with one publication on a fresh account, at a fixed instant.
	private async Task<(Guid PublicationId, Guid PostId, Guid AccountId)> _SeedPostAsync(
		Guid tenantId,
		string body,
		DateTime scheduledAtUtc,
		PublicationStatus status
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var author = await db.User.AsNoTracking().SingleAsync(u => u.Email == TestConstants.AcmeAdminEmail);
		var post = new Modules.Posts.Entities.Post {
			TenantId = tenantId,
			Body = body,
			CreatedByUserId = author.GetRequiredId(),
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();
		var (publicationId, accountId) = await this._AddRowAsync(
			tenantId, post.GetRequiredId(), status, scheduledAtUtc, new DateTime(2097, 1, 1, 0, 0, 0, DateTimeKind.Utc)
		);
		return (publicationId, post.GetRequiredId(), accountId);
	}

	private async Task<(Guid PublicationId, Guid AccountId)> _AddRowAsync(
		Guid tenantId,
		Guid postId,
		PublicationStatus status,
		DateTime scheduledAtUtc,
		DateTime createdAtUtc,
		Guid? accountId = null
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var resolved = accountId;
		if (resolved is null) {
			var account = new SocialAccount {
				TenantId = tenantId,
				ExternalAccountId = "did:plc:" + Guid.NewGuid().ToString("N"),
				DisplayHandle = "@postlist." + Guid.NewGuid().ToString("N")[..5] + ".bsky.social",
				ProtectedCredentials = "enc-spec-blob",
			};
			db.SocialAccount.Add(account);
			await db.SaveChangesAsync();
			resolved = account.GetRequiredId();
		}

		var publication = new Publication {
			TenantId = tenantId,
			PostId = postId,
			SocialAccountId = resolved.Value,
			Status = status,
			ScheduledAtUtc = scheduledAtUtc,
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = "pending",
			CreatedAt = createdAtUtc,
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return (publication.GetRequiredId(), resolved.Value);
	}

	private async Task _CancelAsync(Guid publicationId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		_ = await db.Publication
			.Where(p => p.Id == publicationId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(p => p.IsDeleted, true)
				.SetProperty(p => p.DeletedAt, DateTime.UtcNow));
	}

	private async Task<HttpResponseMessage> _GetAsync(Guid tenantId, string token, string postId) {
		using var request = new HttpRequestMessage(HttpMethod.Get, $"/posts/{postId}/publications")
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		return await this._Http.SendAsync(request);
	}

	private async Task<List<JsonElement>> _RowsAsync(Guid tenantId, string token, Guid postId) {
		using var response = await this._GetAsync(tenantId, token, postId.ToString());
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
		return doc.RootElement.GetProperty("data").EnumerateArray().Select(row => row.Clone()).ToList();
	}

	[Fact]
	public async Task ItShouldFindAFailedAndAFarOutRowWithoutAWindow() {
		var tenantId = await this._TenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await this._AdminTokenAsync();
		// Failed long ago (outside the queue's 24 h carryover), and scheduled far past 31 days.
		var failed = await this._SeedPostAsync(
			tenantId, "post scoped probe", new DateTime(2020, 1, 5, 9, 0, 0, DateTimeKind.Utc), PublicationStatus.Failed
		);
		var farOut = await this._AddRowAsync(
			tenantId, failed.PostId, PublicationStatus.Scheduled,
			new DateTime(2099, 3, 1, 9, 0, 0, DateTimeKind.Utc), new DateTime(2098, 1, 1, 9, 0, 0, DateTimeKind.Utc)
		);

		var rows = await this._RowsAsync(tenantId, token, failed.PostId);

		rows.Select(row => row.GetProperty("publicationId").GetString())
			.Should().Equal(failed.PublicationId.ToString(), farOut.PublicationId.ToString());
		rows.Select(row => row.GetProperty("status").GetString()).Should().Equal("failed", "scheduled");
		foreach (var row in rows) {
			row.GetProperty("customized").GetBoolean().Should().BeFalse();
			row.GetProperty("superseded").GetBoolean().Should().BeFalse();
			row.GetProperty("destinationCount").GetInt32().Should().Be(2);
		}
	}

	[Fact]
	public async Task ItShouldLeaveOutCancelledAndReplacedRows() {
		var tenantId = await this._TenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await this._AdminTokenAsync();
		var replaced = await this._SeedPostAsync(
			tenantId, "post scoped replaced", new DateTime(2098, 2, 1, 9, 0, 0, DateTimeKind.Utc), PublicationStatus.Failed
		);
		// The same pair re-issued later: the Failed row is history.
		var reissued = await this._AddRowAsync(
			tenantId, replaced.PostId, PublicationStatus.Scheduled,
			new DateTime(2098, 2, 2, 9, 0, 0, DateTimeKind.Utc), new DateTime(2098, 1, 1, 9, 0, 0, DateTimeKind.Utc),
			replaced.AccountId
		);
		var cancelled = await this._AddRowAsync(
			tenantId, replaced.PostId, PublicationStatus.Scheduled,
			new DateTime(2098, 2, 3, 9, 0, 0, DateTimeKind.Utc), new DateTime(2098, 1, 1, 9, 0, 0, DateTimeKind.Utc)
		);
		await this._CancelAsync(cancelled.PublicationId);

		var rows = await this._RowsAsync(tenantId, token, replaced.PostId);

		rows.Select(row => row.GetProperty("publicationId").GetString())
			.Should().Equal(reissued.PublicationId.ToString());
	}

	[Fact]
	public async Task ItShouldReturn404ForAnUnknownOrForeignPost() {
		var acmeId = await this._TenantIdAsync(SeedConstants.Tenants.AcmeName);
		var techStartId = await this._TenantIdAsync(SeedConstants.Tenants.TechStartName);
		var token = await this._AdminTokenAsync();
		var foreign = await this._SeedPostAsync(
			techStartId, "foreign post probe", new DateTime(2099, 4, 1, 9, 0, 0, DateTimeKind.Utc),
			PublicationStatus.Scheduled
		);

		using var unknown = await this._GetAsync(acmeId, token, Guid.NewGuid().ToString());
		using var other = await this._GetAsync(acmeId, token, foreign.PostId.ToString());

		unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
		other.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturn400ForAMalformedPostId() {
		var tenantId = await this._TenantIdAsync(SeedConstants.Tenants.AcmeName);
		var token = await this._AdminTokenAsync();

		using var response = await this._GetAsync(tenantId, token, "not-a-guid");

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		(await response.Content.ReadAsStringAsync()).Should().Contain("malformed");
	}

	[Fact]
	public async Task ItShouldReturn403WithoutViewPermission() {
		var tenantId = await this._TenantIdAsync(SeedConstants.Tenants.AcmeName);
		var userToken = await this._AuthClient.LoginAsync(TestConstants.AcmeUserEmail, TestConstants.SeedPassword);

		using var response = await this._GetAsync(tenantId, userToken, Guid.NewGuid().ToString());

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}
}
