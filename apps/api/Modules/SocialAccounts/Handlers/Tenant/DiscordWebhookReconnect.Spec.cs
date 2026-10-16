using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Discord;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// A deleted webhook cannot be revived: reconnecting pastes a NEW webhook into the SAME
// account, which keeps its row, becomes Active again and gets its paused queue back.
// Real HTTP and Postgres; Discord is a fake handler keyed on the webhook id.
public sealed class DiscordWebhookReconnectSpec : IClassFixture<ApiFixture> {
	private const string _Token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGhIjKlMnOpQrStUvWxYz01";
	private const string _OldId = "1234567890123456001";
	private const string _NewId = "1234567890123456002";

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;
	private readonly Dictionary<string, int> _Status = new() {
		[DiscordWebhookReconnectSpec._OldId] = 200,
		[DiscordWebhookReconnectSpec._NewId] = 200,
	};

	public DiscordWebhookReconnectSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		var factory = fixture.Factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
			services.AddHttpClient(DiscordWebhookClient.HttpClientName)
				.ConfigurePrimaryHttpMessageHandler(() => new FakeDiscord(this._Status))));
		this._Http = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _Url(string id) {
		return $"https://discord.com/api/webhooks/{id}/{DiscordWebhookReconnectSpec._Token}";
	}

	[Fact]
	public async Task ItShouldReplaceTheWebhookOfTheSameAccountAndResumeItsPausedPublications() {
		var (tenantId, token) = await this._LoginAsync();
		var oldId = $"2{Guid.NewGuid().GetHashCode() & 0xFFFFFF:D8}0000000000";
		var newId = $"3{Guid.NewGuid().GetHashCode() & 0xFFFFFF:D8}0000000000";
		this._Status[oldId] = 200;
		this._Status[newId] = 200;
		using var connected = await this._PostAsync(tenantId, token, new { webhookUrl = DiscordWebhookReconnectSpec._Url(oldId) });
		connected.StatusCode.Should().Be(HttpStatusCode.OK);
		var accountId = Guid.Parse((await connected.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString() ?? string.Empty);

		// The webhook is deleted in Discord: the account needs reconnecting, its queue is paused.
		this._Status[oldId] = 404;
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await db.SocialAccount.Where(a => a.Id == accountId)
			.ExecuteUpdateAsync(s => s.SetProperty(a => a.Status, SocialAccountStatus.NeedsReconnect));
		var publicationId = await DiscordWebhookReconnectSpec._SeedPausedPublicationAsync(
			db, scope.ServiceProvider.GetRequiredService<IPublicationStatusTransitionService>(), tenantId, accountId
		);

		// Pasting the dead webhook again is refused.
		using var refused = await this._PostAsync(tenantId, token, new { webhookUrl = DiscordWebhookReconnectSpec._Url(oldId), socialAccountId = accountId });
		refused.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		using var response = await this._PostAsync(
			tenantId, token, new { webhookUrl = DiscordWebhookReconnectSpec._Url(newId), socialAccountId = accountId }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var body = await response.Content.ReadAsStringAsync();
		body.Should().NotContain(DiscordWebhookReconnectSpec._Token);
		var accounts = await db.SocialAccount.AsNoTracking()
			.Where(a => a.TenantId == tenantId && a.Provider == SocialProvider.DiscordWebhook && !a.IsDeleted)
			.ToListAsync();
		var account = accounts.Should().ContainSingle(a => a.Id == accountId).Subject;
		accounts.Where(a => a.ExternalAccountId == oldId || a.ExternalAccountId == newId)
			.Should().ContainSingle("no second account is created");
		account.ExternalAccountId.Should().Be(newId);
		account.Status.Should().Be(SocialAccountStatus.Active);
		account.LastError.Should().BeNull();
		var publication = await db.Publication.AsNoTracking().SingleAsync(p => p.Id == publicationId);
		publication.Status.Should().Be(PublicationStatus.Scheduled, "the paused queue resumes on reconnect");
	}

	[Fact]
	public async Task ItShouldRefuseToReplaceWithAWebhookThatIsAlreadyAnotherAccountAndUnknownAccounts() {
		var (tenantId, token) = await this._LoginAsync();
		var firstId = $"4{Guid.NewGuid().GetHashCode() & 0xFFFFFF:D8}0000000000";
		var secondId = $"5{Guid.NewGuid().GetHashCode() & 0xFFFFFF:D8}0000000000";
		this._Status[firstId] = 200;
		this._Status[secondId] = 200;
		using var first = await this._PostAsync(tenantId, token, new { webhookUrl = DiscordWebhookReconnectSpec._Url(firstId) });
		using var second = await this._PostAsync(tenantId, token, new { webhookUrl = DiscordWebhookReconnectSpec._Url(secondId) });
		var secondAccountId = (await second.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

		using var duplicate = await this._PostAsync(
			tenantId, token, new { webhookUrl = DiscordWebhookReconnectSpec._Url(firstId), socialAccountId = secondAccountId }
		);
		using var unknown = await this._PostAsync(
			tenantId, token, new { webhookUrl = DiscordWebhookReconnectSpec._Url(firstId), socialAccountId = Guid.NewGuid() }
		);

		first.StatusCode.Should().Be(HttpStatusCode.OK);
		duplicate.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<HttpResponseMessage> _PostAsync(Guid tenantId, string token, object payload) {
		using var request = new HttpRequestMessage(HttpMethod.Post, "/social-accounts/discord-webhook")
			.WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(payload);
		return await this._Http.SendAsync(request);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(this._Http, staffToken, SeedConstants.Tenants.AcmeName);
		var token = await this._AuthClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword);
		return (tenantId, token);
	}

	private static async Task<Guid> _SeedPausedPublicationAsync(
		AppDbContext db,
		IPublicationStatusTransitionService transitions,
		Guid tenantId,
		Guid accountId
	) {
		var user = new User { Email = $"discord-reconnect-{Guid.NewGuid():N}@example.com", Password = "unused", IsVerified = true };
		db.User.Add(user);
		await db.SaveChangesAsync();
		var post = new Post { TenantId = tenantId, Body = "discord reconnect spec", CreatedByUserId = user.GetRequiredId() };
		db.Post.Add(post);
		await db.SaveChangesAsync();
		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = accountId,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(3),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = $"discord-reconnect-{Guid.NewGuid():N}",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		// Only the transition service writes a status: pause it the way a deleted webhook does.
		await transitions.MarkPausedAsync(
			new MarkPublicationPausedArgs(publication.GetRequiredId(), tenantId, "its Discord webhook was deleted"),
			default
		);
		return publication.GetRequiredId();
	}

	private sealed class FakeDiscord : HttpMessageHandler {
		private readonly Dictionary<string, int> _Status;

		public FakeDiscord(Dictionary<string, int> status) {
			this._Status = status;
		}

		protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
			var id = request.RequestUri?.AbsolutePath.Split('/')[^2] ?? string.Empty;
			var status = this._Status.GetValueOrDefault(id, 404);
			return Task.FromResult(new HttpResponseMessage((HttpStatusCode)status) {
				Content = new StringContent(
					status == 200 ? $$"""{"id":"{{id}}","name":"Hook {{id[^4..]}}","guild_id":"777","channel_id":"888"}""" : "{}",
					Encoding.UTF8,
					"application/json"
				),
			});
		}
	}
}
