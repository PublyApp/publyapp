using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// C4 Task 5: reconnect resumes future-instant paused rows and re-pauses past-due
// ones with a choose-a-new-time cause; disconnect pauses every non-terminal row
// of the account. Real ephemeral Postgres over HTTP, Bluesky faked.
public sealed class SocialAccountPublicationLifecycleSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public SocialAccountPublicationLifecycleSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task ItShouldResumeFuturePausedRowsAndRePausePastDueRowsOnReconnect() {
		var (tenantId, token, accountId) = await _ConnectNewAccountAsync();
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var fake = scope.ServiceProvider.GetRequiredService<FakeBlueskyClient>();

		// Simulate the credential break C4 reacts to: the account sits NeedsReconnect.
		await db.SocialAccount
			.Where(a => a.Id == accountId)
			.ExecuteUpdateAsync(
				s => s.SetProperty(a => a.Status, SocialAccountStatus.NeedsReconnect)
			);

		var userId = await _SeedUserAsync(db);
		var futureInstant = DateTime.UtcNow.AddHours(2);
		var futureId = await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Paused, futureInstant
		);
		var pastDueId = await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Paused, DateTime.UtcNow.AddHours(-1)
		);

		fake.NextResult = null; // default success: reconnect goes through
		using var request = new HttpRequestMessage(
			HttpMethod.Post, $"/social-accounts/{accountId}/reconnect"
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new { appPassword = "app-password-444" });
		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var future = await _ReloadAsync(db, futureId);
		future.Status.Should().Be(
			PublicationStatus.Scheduled, "a future-instant row resumes on reconnect"
		);
		future.LastError.Should().BeNull();
		future.ScheduledAtUtc.Should().BeCloseTo(futureInstant, TimeSpan.FromSeconds(5));

		var pastDue = await _ReloadAsync(db, pastDueId);
		pastDue.Status.Should().Be(
			PublicationStatus.Paused, "a past-due row must never fire late"
		);
		pastDue.LastError.Should().Contain("choose a new time");
	}

	[Fact]
	public async Task ItShouldPauseEveryNonTerminalRowOfTheAccountOnDisconnect() {
		var (tenantId, token, accountId) = await _ConnectNewAccountAsync();
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var userId = await _SeedUserAsync(db);
		var scheduledId = await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Scheduled, DateTime.UtcNow.AddHours(2)
		);
		var pausedId = await _SeedPublicationAsync(
			db, tenantId, accountId, userId,
			PublicationStatus.Paused, DateTime.UtcNow.AddHours(-1)
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post, $"/social-accounts/{accountId}/disconnect"
		).WithSessionToken(token).WithTenantId(tenantId);
		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		foreach (var publicationId in new[] { scheduledId, pausedId }) {
			var publication = await _ReloadAsync(db, publicationId);
			publication.Status.Should().Be(
				PublicationStatus.Paused, "disconnect stops everything non-terminal"
			);
			publication.LastError.Should().Contain("disconnected");
		}
	}

	private async Task<(Guid TenantId, string Token, Guid AccountId)> _ConnectNewAccountAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		using var request = new HttpRequestMessage(
			HttpMethod.Post, "/social-accounts/connect"
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			identifier = $"lifecycle-{Guid.NewGuid():N}@example.com",
			appPassword = "app-password-555",
		});
		using var response = await _Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var body = await response.Content.ReadFromJsonAsync<JsonElement>();
		var accountIdValue = body.GetProperty("id").GetString();
		if (accountIdValue is null) {
			throw new InvalidOperationException("connect response had no id");
		}

		var accountId = Guid.Parse(
			accountIdValue
		);
		return (tenantId, token, accountId);
	}

	private static async Task<Guid> _SeedUserAsync(AppDbContext db) {
		var user = new User {
			Email = $"pub-lifecycle-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private static async Task<Guid> _SeedPublicationAsync(
		AppDbContext db,
		Guid tenantId,
		Guid accountId,
		Guid userId,
		PublicationStatus status,
		DateTime scheduledAtUtc
	) {
		var post = new Post {
			TenantId = tenantId,
			Body = "publication lifecycle spec body",
			CreatedByUserId = userId,
		};
		db.Post.Add(post);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = accountId,
			Status = status,
			ScheduledAtUtc = scheduledAtUtc,
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = $"lifecycle-{Guid.NewGuid():N}",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return publication.GetRequiredId();
	}

	private static async Task<Publication> _ReloadAsync(AppDbContext db, Guid publicationId) {
		var entity = await db.Publication.SingleAsync(p => p.Id == publicationId);
		await db.Entry(entity).ReloadAsync();
		return entity;
	}
}
