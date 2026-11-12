using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// Operator switch per provider (#2184): a provider listed in DISABLED_PUBLISH_PROVIDERS is
// refused by every connect endpoint with the same typed 422, before anything is stored or
// contacted. The controls at the end send the same requests with the provider enabled and
// expect their normal answer (the Bluesky connect has none: it would call Bluesky).
public sealed class ProviderDisabledSpec : IClassFixture<ApiFixture> {
	private sealed class FakeAvailability : IProviderAvailability {
		private readonly HashSet<SocialProvider> _Disabled;

		public FakeAvailability(params SocialProvider[] disabled) {
			this._Disabled = [.. disabled];
		}

		public bool IsEnabled(SocialProvider provider) {
			return !this._Disabled.Contains(provider);
		}
	}

	private readonly ApiFixture _Fixture;

	public ProviderDisabledSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private HttpClient _Client(params SocialProvider[] disabled) {
		var factory = this._Fixture.Factory.WithWebHostBuilder(builder => builder.ConfigureServices(
			services => services.AddSingleton<IProviderAvailability>(new FakeAvailability(disabled))
		));
		return factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsync(HttpClient http) {
		var tenantId = await TenantMemberTestHelper.GetTenantIdAsync(this._Fixture, SeedConstants.Tenants.AcmeName);
		var token = await new TestAuthClient(http).LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private static async Task<HttpResponseMessage> _PostAsync(
		HttpClient http, string token, Guid tenantId, string path, object body
	) {
		using var request = new HttpRequestMessage(HttpMethod.Post, $"/social-accounts{path}")
			.WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(body);
		return await http.SendAsync(request);
	}

	private static async Task<ValidationProblemDetails> _ProblemAsync(HttpResponseMessage response) {
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		return problem;
	}

	private static async Task _ExpectDisabledAsync(HttpResponseMessage response, string provider) {
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("provider-disabled");
		problem.Errors.Should().ContainKey("provider");
		Convert.ToString(problem.Extensions["provider"], System.Globalization.CultureInfo.InvariantCulture).Should().Be(provider);
	}

	[Fact]
	public async Task ItShouldRefuseABlueskyConnectWhenBlueskyIsDisabled() {
		var http = this._Client(SocialProvider.Bluesky);
		var (tenantId, token) = await this._LoginAsync(http);

		using var response = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/connect",
			new { identifier = "alice.example.com", appPassword = "abcd-efgh-ijkl-mnop" }
		);

		await ProviderDisabledSpec._ExpectDisabledAsync(response, "bluesky");
	}

	[Fact]
	public async Task ItShouldRefuseABlueskyReconnectWhenBlueskyIsDisabled() {
		var http = this._Client(SocialProvider.Bluesky);
		var (tenantId, token) = await this._LoginAsync(http);

		using var response = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, $"/{Guid.NewGuid()}/reconnect",
			new { appPassword = "abcd-efgh-ijkl-mnop" }
		);

		await ProviderDisabledSpec._ExpectDisabledAsync(response, "bluesky");
	}

	[Theory]
	[InlineData(SocialProvider.Mastodon, null, "mastodon")]
	[InlineData(SocialProvider.Pixelfed, "pixelfed", "pixelfed")]
	public async Task ItShouldRefuseAFediverseConnectStartWhenItsProviderIsDisabled(
		SocialProvider disabled, string? bodyProvider, string wire
	) {
		var http = this._Client(disabled);
		var (tenantId, token) = await this._LoginAsync(http);

		// "localhost" is rejected by the host guard when the provider is enabled (control below).
		using var response = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/mastodon/start", new { instance = "localhost", provider = bodyProvider }
		);

		await ProviderDisabledSpec._ExpectDisabledAsync(response, wire);
	}

	[Fact]
	public async Task ItShouldKeepAnotherProviderConnectableWhenOnlyMastodonIsDisabled() {
		var http = this._Client(SocialProvider.Mastodon);
		var (tenantId, token) = await this._LoginAsync(http);

		using var response = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/mastodon/start", new { instance = "localhost", provider = "pixelfed" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("mastodon-instance-invalid");
	}

	[Fact]
	public async Task ItShouldRefuseADiscordWebhookWhenDiscordIsDisabled() {
		var http = this._Client(SocialProvider.DiscordWebhook);
		var (tenantId, token) = await this._LoginAsync(http);

		using var response = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/discord-webhook", new { webhookUrl = "https://example.com/not-a-webhook" }
		);

		await ProviderDisabledSpec._ExpectDisabledAsync(response, "discord_webhook");
	}

	[Fact]
	public async Task ItShouldRefuseTheCallbackOfAnAuthorizationStartedBeforeThePixelfedSwitchAndKeepItUnconsumed() {
		var http = this._Client(SocialProvider.Pixelfed);
		var (tenantId, token) = await this._LoginAsync(http);
		var state = $"state-{Guid.NewGuid():N}";
		await using (var scope = this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var admin = await db.User.SingleAsync(user => user.Email == TestConstants.AcmeAdminEmail);
			var userId = admin.GetRequiredId();
			db.OAuthState.Add(new OAuthState {
				TenantId = tenantId,
				UserId = userId,
				StateHash = MastodonOAuthService.Hash(state),
				Provider = SocialProvider.Pixelfed,
				InstanceHost = "pixelfed.example",
				ExpiresAt = DateTime.UtcNow.AddMinutes(10),
			});
			await db.SaveChangesAsync();
		}

		using var response = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/mastodon/callback", new { code = "the-code", state }
		);

		await ProviderDisabledSpec._ExpectDisabledAsync(response, "pixelfed");
		await using var check = this._Fixture.Factory.Services.CreateAsyncScope();
		var consumed = await check.ServiceProvider.GetRequiredService<AppDbContext>().OAuthState
			.AsNoTracking()
			.Where(row => row.StateHash == MastodonOAuthService.Hash(state))
			.Select(row => row.ConsumedAt)
			.SingleAsync();
		consumed.Should().BeNull("the refusal happens before the state is spent");
	}

	[Fact]
	public async Task ItShouldAnswerTheNormalErrorWhenTheProviderIsEnabled() {
		var http = this._Client();
		var (tenantId, token) = await this._LoginAsync(http);

		using var reconnect = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, $"/{Guid.NewGuid()}/reconnect", new { appPassword = "abcd-efgh-ijkl-mnop" }
		);
		reconnect.StatusCode.Should().Be(HttpStatusCode.NotFound);

		using var start = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/mastodon/start", new { instance = "localhost" }
		);
		(await ProviderDisabledSpec._ProblemAsync(start)).TranslationKey
			.Should().Be("mastodon-instance-invalid");

		using var callback = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/mastodon/callback", new { code = "c", state = "unknown-state" }
		);
		(await ProviderDisabledSpec._ProblemAsync(callback)).TranslationKey
			.Should().Be("mastodon-oauth-state-invalid");

		using var discord = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/discord-webhook", new { webhookUrl = "https://example.com/not-a-webhook" }
		);
		(await ProviderDisabledSpec._ProblemAsync(discord)).TranslationKey
			.Should().NotBe("provider-disabled");
	}

	[Fact]
	public async Task ItShouldNameTheProviderForHumansInTheDetail() {
		var http = this._Client(SocialProvider.DiscordWebhook);
		var (tenantId, token) = await this._LoginAsync(http);

		using var response = await ProviderDisabledSpec._PostAsync(
			http, token, tenantId, "/discord-webhook", new { webhookUrl = "https://example.com/not-a-webhook" }
		);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.Detail.Should().StartWith("Discord is disabled").And.NotContain("discord_webhook");
	}
}
