using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// GET /publishing/capabilities (#2184): the registry defaults per provider plus the
// operator's enabled switch. Read by the composer (publish verb) and the connect screen
// (manage verb), so either verb opens it and nothing else does.
public sealed class GetProviderCapabilitiesForTenantSpec : IClassFixture<ApiFixture> {
	private sealed class AllOn : IProviderAvailability {
		public bool IsEnabled(SocialProvider provider) {
			return true;
		}
	}

	private sealed class MastodonOff : IProviderAvailability {
		public bool IsEnabled(SocialProvider provider) {
			return provider != SocialProvider.Mastodon;
		}
	}

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetProviderCapabilitiesForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private sealed record Item(string Provider, bool Enabled, PublishTargetLimits Limits);

	private sealed record Payload(IReadOnlyList<Item> Items);

	private async Task<(Guid TenantId, string Token)> _LoginAsAdminAsync(HttpClient http) {
		var tenantId = await TenantMemberTestHelper.GetTenantIdAsync(this._Fixture, SeedConstants.Tenants.AcmeName);
		var token = await new TestAuthClient(http).LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private static async Task<HttpResponseMessage> _GetAsync(HttpClient http, string token, Guid tenantId) {
		using var request = new HttpRequestMessage(HttpMethod.Get, "/publishing/capabilities")
			.WithSessionToken(token).WithTenantId(tenantId);
		return await http.SendAsync(request);
	}

	[Fact]
	public async Task ItShouldListEveryProviderWithItsRegistryLimitsAndEnabled() {
		var factory = this._Fixture.Factory.WithWebHostBuilder(builder => builder.ConfigureServices(
			services => services.AddSingleton<IProviderAvailability>(new AllOn())
		));
		var http = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
		var (tenantId, token) = await this._LoginAsAdminAsync(http);

		using var response = await GetProviderCapabilitiesForTenantSpec._GetAsync(http, token, tenantId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<Payload>(
			new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)
		);
		Assert.NotNull(payload);
		payload.Items.Select(item => item.Provider).Should()
			.BeEquivalentTo("bluesky", "mastodon", "pixelfed", "discord_webhook");
		payload.Items.Should().OnlyContain(item => item.Enabled);

		var bluesky = payload.Items.Single(item => item.Provider == "bluesky").Limits;
		bluesky.TextLimits.Select(limit => (limit.Unit, limit.Max)).Should()
			.Equal(("graphemes", 300), ("bytes", 3000));
		bluesky.MaxImages.Should().Be(4);
		bluesky.RequiresText.Should().BeTrue();
		bluesky.RequiresAltText.Should().BeFalse();
		bluesky.SupportsVideo.Should().BeTrue();
		bluesky.SupportsThreads.Should().BeTrue();

		var pixelfed = payload.Items.Single(item => item.Provider == "pixelfed").Limits;
		pixelfed.RequiresMedia.Should().BeTrue();
		pixelfed.RequiresText.Should().BeFalse();
		pixelfed.SupportsThreads.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldReportAProviderTheOperatorSwitchedOffAsNotEnabled() {
		var factory = this._Fixture.Factory.WithWebHostBuilder(builder => builder.ConfigureServices(
			services => services.AddSingleton<IProviderAvailability>(new MastodonOff())
		));
		var http = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
		var (tenantId, token) = await this._LoginAsAdminAsync(http);

		using var response = await GetProviderCapabilitiesForTenantSpec._GetAsync(http, token, tenantId);

		var payload = await response.Content.ReadFromJsonAsync<Payload>(
			new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)
		);
		Assert.NotNull(payload);
		payload.Items.Where(item => !item.Enabled).Select(item => item.Provider).Should().Equal("mastodon");
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutASession() {
		var tenantId = await TenantMemberTestHelper.GetTenantIdAsync(this._Fixture, SeedConstants.Tenants.AcmeName);
		using var request = new HttpRequestMessage(HttpMethod.Get, "/publishing/capabilities").WithTenantId(tenantId);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldRefuseACallerWithNeitherThePublishNorTheManageVerb() {
		await this._AssertStatusForVerbAsync(AppPermissions.Tenant.Posts.VIEW.Key, HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldOpenForTheComposerPublishVerb() {
		await this._AssertStatusForVerbAsync(AppPermissions.Tenant.SocialAccounts.PUBLISH.Key, HttpStatusCode.OK);
	}

	// The integrations page (and its preloaded query) is readable with view alone.
	[Fact]
	public async Task ItShouldOpenForTheIntegrationsPageViewVerb() {
		await this._AssertStatusForVerbAsync(AppPermissions.Tenant.SocialAccounts.VIEW.Key, HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldOpenForTheConnectScreenManageVerb() {
		await this._AssertStatusForVerbAsync(AppPermissions.Tenant.SocialAccounts.MANAGE.Key, HttpStatusCode.OK);
	}

	private async Task _AssertStatusForVerbAsync(string permissionKey, HttpStatusCode expected) {
		var tenantId = await TenantMemberTestHelper.GetTenantIdAsync(this._Fixture, SeedConstants.Tenants.AcmeName);
		var email = await TenantMemberTestHelper.SeedMemberAsync(this._Fixture, tenantId, [permissionKey]);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);

		using var response = await GetProviderCapabilitiesForTenantSpec._GetAsync(this._Http, token, tenantId);

		response.StatusCode.Should().Be(expected);
	}
}
