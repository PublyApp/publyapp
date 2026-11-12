using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// #2186 over real HTTP and Postgres with the Mastodon instance faked (no network): what the
// browser sees when a reconnect comes back as another account, when the reconnect target is
// unknown, and when a tenant is over its new-server registration quota.
public sealed class MastodonReconnectAndQuotaSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;
	private readonly FakeMastodonClient _Instance = new();

	public MastodonReconnectAndQuotaSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		var factory = fixture.Factory.WithWebHostBuilder(builder => builder.ConfigureServices(
			services => services.AddScoped<IMastodonClient>(_ => this._Instance)
		));
		this._Http = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsync() {
		var tenantId = await TenantMemberTestHelper.GetTenantIdAsync(this._Fixture, SeedConstants.Tenants.AcmeName);
		var token = await this._AuthClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword);
		return (tenantId, token);
	}

	private async Task<Guid> _SeedAccountAsync(Guid tenantId, string host, string id, SocialAccountStatus status) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var account = new SocialAccount {
			TenantId = tenantId,
			Provider = SocialProvider.Mastodon,
			ExternalAccountId = $"{id}@{host}",
			DisplayHandle = $"alice@{host}",
			CredentialType = SocialCredentialType.OAuth,
			ProtectedCredentials = "old-protected-blob",
			Status = status,
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private async Task<HttpResponseMessage> _PostAsync(string path, string token, Guid tenantId, object body) {
		using var request = new HttpRequestMessage(HttpMethod.Post, $"/social-accounts/mastodon/{path}")
			.WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(body);
		return await this._Http.SendAsync(request);
	}

	private async Task<string> _StartAsync(string token, Guid tenantId, string host, Guid? reconnect) {
		using var response = await this._PostAsync("start", token, tenantId, new { instance = host, socialAccountId = reconnect });
		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var url = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("authorizeUrl").GetString() ?? string.Empty;
		return System.Web.HttpUtility.ParseQueryString(new Uri(url).Query)["state"] ?? string.Empty;
	}

	[Fact]
	public async Task ItShouldRefuseAReconnectSignedInAsAnotherAccountAndAskTheFrontWhatToDo() {
		var (tenantId, token) = await this._LoginAsync();
		var host = $"mismatch-{Guid.NewGuid():N}.example";
		var accountId = await this._SeedAccountAsync(tenantId, host, "109", SocialAccountStatus.NeedsReconnect);
		var state = await this._StartAsync(token, tenantId, host, accountId);
		this._Instance.Account = new MastodonAccountInfo("777", "bob");

		using var response = await this._PostAsync("callback", token, tenantId, new { code = "c", state });

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
		problem.GetProperty("translationKey").GetString().Should().Be("mastodon-reconnect-account-mismatch");
		problem.GetProperty("expectedHandle").GetString().Should().Be($"alice@{host}");
		problem.GetProperty("actualHandle").GetString().Should().Be($"bob@{host}");
		problem.GetProperty("provider").GetString().Should().Be("mastodon");
		problem.GetProperty("instanceHost").GetString().Should().Be(host);
		// The standard ProblemDetails member stays the request path: our key must not shadow it.
		problem.GetProperty("instance").GetString().Should().EndWith("/social-accounts/mastodon/callback");
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var stored = await db.SocialAccount.AsNoTracking().Where(a => a.TenantId == tenantId && a.ExternalAccountId.EndsWith("@" + host)).ToListAsync();
		stored.Should().ContainSingle().Which.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
	}

	[Fact]
	public async Task ItShouldReconnectTheSameAccountAndReactivateIt() {
		var (tenantId, token) = await this._LoginAsync();
		var host = $"same-{Guid.NewGuid():N}.example";
		var accountId = await this._SeedAccountAsync(tenantId, host, "109", SocialAccountStatus.NeedsReconnect);
		var state = await this._StartAsync(token, tenantId, host, accountId);
		this._Instance.Account = new MastodonAccountInfo("109", "alice");

		using var response = await this._PostAsync("callback", token, tenantId, new { code = "c", state });

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid().Should().Be(accountId);
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		(await db.SocialAccount.AsNoTracking().SingleAsync(a => a.Id == accountId)).Status.Should().Be(SocialAccountStatus.Active);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenTheReconnectTargetIsNotAnAccountOfTheTenant() {
		var (tenantId, token) = await this._LoginAsync();

		using var response = await this._PostAsync("start", token, tenantId, new {
			instance = $"unknown-target-{Guid.NewGuid():N}.example",
			socialAccountId = Guid.NewGuid(),
		});

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldAnswerTooManyRequestsWhenTheTenantIsOverTheNewServerQuota() {
		var (tenantId, token) = await this._LoginAsync();
		var marker = $"quota-http-{Guid.NewGuid():N}";
		await using (var scope = this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			for (var i = 0; i < MastodonOAuthService.MaxNewHostRegistrationsPerTenant; i++) {
				db.OAuthAppRegistration.Add(new OAuthAppRegistration {
					Host = $"{marker}-{i}.example",
					ClientId = "id",
					ProtectedClientSecret = "secret",
					Scopes = MastodonOAuthService.Scopes,
					RedirectUri = "https://front.example/x",
					RegisteredByTenantId = tenantId,
					RegisteredAt = DateTime.UtcNow,
				});
			}

			await db.SaveChangesAsync();
		}

		try {
			using var response = await this._PostAsync("start", token, tenantId, new { instance = $"one-more-{Guid.NewGuid():N}.example" });

			response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
			(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("translationKey").GetString()
				.Should().Be("mastodon-registration-quota-exceeded");
			this._Instance.Calls.Should().NotContain(call => call.StartsWith("register one-more", StringComparison.Ordinal));
		} finally {
			// The fixture's tenant is shared with the other specs of this class: leave no quota behind.
			await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
			var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			await db.OAuthAppRegistration.Where(r => r.Host.StartsWith(marker)).ExecuteDeleteAsync();
		}
	}
}
