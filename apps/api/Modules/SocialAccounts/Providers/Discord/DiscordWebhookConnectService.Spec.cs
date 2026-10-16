using System.Net;
using System.Text;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Discord;

// The Discord connect flow against a recording fake Discord (no network): the pasted URL
// is verified with a GET, stored encrypted, and never comes back out.
public sealed class DiscordWebhookConnectServiceSpec : IClassFixture<ApiFixture> {
	private const string _Token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGhIjKlMnOpQrStUvWxYz01";

	private readonly ApiFixture _Fixture;

	public DiscordWebhookConnectServiceSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private sealed record Harness(
		AppDbContext Db,
		DiscordWebhookConnectService Service,
		List<string> Calls,
		ICredentialProtector Protector,
		Guid TenantId
	);

	private async Task<(Harness Harness, AsyncServiceScope Scope)> _NewAsync(int status = 200) {
		var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = new Tenant {
			Name = $"Discord {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		var calls = new List<string>();
		var services = new ServiceCollection();
		services.AddHttpClient(DiscordWebhookClient.HttpClientName)
			.ConfigurePrimaryHttpMessageHandler(() => new FakeDiscord(calls, status));
		var factory = services.BuildServiceProvider().GetRequiredService<IHttpClientFactory>();
		var protector = scope.ServiceProvider.GetRequiredService<ICredentialProtector>();
		return (
			new Harness(db, new DiscordWebhookConnectService(db, protector, new DiscordWebhookClient(factory)), calls, protector, tenant.GetRequiredId()),
			scope
		);
	}

	private static string _Url(string id) {
		return $"https://discord.com/api/webhooks/{id}/{DiscordWebhookConnectServiceSpec._Token}";
	}

	[Fact]
	public async Task ItShouldVerifyTheWebhookWithAGetThenStoreItEncryptedUnderItsName() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var url = DiscordWebhookConnectServiceSpec._Url("1234567890123456781");

		var result = await h.Service.ConnectAsync(h.TenantId, url, default);

		var connected = result.Should().BeOfType<ConnectDiscordWebhookResult.Connected>().Subject;
		connected.WasKnown.Should().BeFalse();
		h.Calls.Should().Equal($"GET {url}");
		var row = await h.Db.SocialAccount.AsNoTracking().SingleAsync(a => a.TenantId == h.TenantId);
		row.Provider.Should().Be(SocialProvider.DiscordWebhook);
		row.CredentialType.Should().Be(SocialCredentialType.WebhookUrl);
		row.ExternalAccountId.Should().Be("1234567890123456781");
		row.DisplayHandle.Should().Be("Release notes");
		row.ProtectedCredentials.Should().NotContain(DiscordWebhookConnectServiceSpec._Token).And.NotContain("webhooks");
		DiscordWebhookCredentials.Unprotect(h.Protector, row.ProtectedCredentials)
			.Should().Be(new DiscordWebhookCredentials(url, "777"));
	}

	[Fact]
	public async Task ItShouldNeverSerializeTheUrlOrTokenInTheAccountListItem() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;

		var result = await h.Service.ConnectAsync(h.TenantId, DiscordWebhookConnectServiceSpec._Url("1234567890123456782"), default);

		var account = result.Should().BeOfType<ConnectDiscordWebhookResult.Connected>().Subject.Account;
		var json = JsonSerializer.Serialize(SocialAccountService.ToListItem(account));
		json.Should().NotContain(DiscordWebhookConnectServiceSpec._Token).And.NotContain("webhooks/");
		json.Should().NotContain(account.ProtectedCredentials);
		var session = await new DiscordWebhookSessionProvider(h.Db, h.Protector).OpenSessionAsync(account.GetRequiredId(), default);
		var opened = session.Should().BeOfType<SocialSessionResult.Opened>().Subject.Session;
		opened.PdsHost.Should().Be("https://discord.com/channels/777");
		opened.ToString().Should().NotContain(DiscordWebhookConnectServiceSpec._Token);
		JsonSerializer.Serialize(opened).Should().NotContain(DiscordWebhookConnectServiceSpec._Token);
	}

	[Theory]
	[InlineData("https://evil.example/api/webhooks/1234567890123456789/TOKEN")]
	[InlineData("http://discord.com/api/webhooks/1234567890123456789/TOKEN")]
	[InlineData("https://discord.com/api/webhooks/1234567890123456789")]
	[InlineData("https://127.0.0.1/api/webhooks/1234567890123456789/TOKEN")]
	public async Task ItShouldRejectABadUrlWithoutAnyRequestOrRow(string input) {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;

		var result = await h.Service.ConnectAsync(h.TenantId, input.Replace("TOKEN", DiscordWebhookConnectServiceSpec._Token), default);

		result.Should().BeOfType<ConnectDiscordWebhookResult.InvalidUrl>();
		h.Calls.Should().BeEmpty();
		(await h.Db.SocialAccount.CountAsync(a => a.TenantId == h.TenantId)).Should().Be(0);
	}

	[Theory]
	[InlineData(404, true)]
	[InlineData(401, true)]
	[InlineData(500, false)]
	[InlineData(429, false)]
	public async Task ItShouldStoreNothingWhenDiscordDoesNotConfirmTheWebhook(int status, bool refused) {
		var (h, scope) = await this._NewAsync(status);
		await using var _ = scope;

		var result = await h.Service.ConnectAsync(h.TenantId, DiscordWebhookConnectServiceSpec._Url("1234567890123456783"), default);

		if (refused) {
			result.Should().BeOfType<ConnectDiscordWebhookResult.Refused>();
		} else {
			result.Should().BeOfType<ConnectDiscordWebhookResult.Unreachable>();
		}

		(await h.Db.SocialAccount.CountAsync(a => a.TenantId == h.TenantId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldTreatPastingTheSameWebhookAgainAsAReconnect() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var url = DiscordWebhookConnectServiceSpec._Url("1234567890123456784");
		var first = (await h.Service.ConnectAsync(h.TenantId, url, default)).Should().BeOfType<ConnectDiscordWebhookResult.Connected>().Subject;
		first.Account.Status = SocialAccountStatus.NeedsReconnect;
		first.Account.LastError = "the Discord webhook was refused";
		await h.Db.SaveChangesAsync();

		var second = (await h.Service.ConnectAsync(h.TenantId, url, default)).Should().BeOfType<ConnectDiscordWebhookResult.Connected>().Subject;

		second.WasKnown.Should().BeTrue();
		second.Account.GetRequiredId().Should().Be(first.Account.GetRequiredId());
		second.Account.Status.Should().Be(SocialAccountStatus.Active);
		second.Account.LastError.Should().BeNull();
		(await h.Db.SocialAccount.CountAsync(a => a.TenantId == h.TenantId)).Should().Be(1);
	}

	private sealed class FakeDiscord : HttpMessageHandler {
		private readonly List<string> _Calls;
		private readonly int _Status;

		public FakeDiscord(List<string> calls, int status) {
			this._Calls = calls;
			this._Status = status;
		}

		protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
			this._Calls.Add($"{request.Method} {request.RequestUri}");
			var body = this._Status == 200
				? $$"""{"id":"1","name":"Release notes","guild_id":"777","channel_id":"888","token":"{{DiscordWebhookConnectServiceSpec._Token}}"}"""
				: "{}";
			return Task.FromResult(new HttpResponseMessage((HttpStatusCode)this._Status) {
				Content = new StringContent(body, Encoding.UTF8, "application/json"),
			});
		}
	}
}
