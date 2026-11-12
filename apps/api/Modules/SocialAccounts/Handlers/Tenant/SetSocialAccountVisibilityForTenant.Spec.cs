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
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// #2186: the per-account default visibility of a Mastodon / Pixelfed account, over HTTP.
public sealed class SetSocialAccountVisibilityForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public SetSocialAccountVisibilityForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var tenantId = await TenantMemberTestHelper.GetTenantIdAsync(this._Fixture, SeedConstants.Tenants.AcmeName);
		var token = await this._AuthClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword);
		return (tenantId, token);
	}

	private async Task<Guid> _SeedAccountAsync(Guid tenantId, SocialProvider provider) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var account = new SocialAccount {
			TenantId = tenantId,
			Provider = provider,
			ExternalAccountId = $"{Guid.NewGuid():N}@vis.example",
			DisplayHandle = $"vis-{Guid.NewGuid():N}@vis.example",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private async Task<HttpResponseMessage> _PutAsync(string token, Guid tenantId, string accountId, object body) {
		using var request = new HttpRequestMessage(HttpMethod.Put, $"/social-accounts/{accountId}/visibility")
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		request.Content = JsonContent.Create(body);
		return await this._Http.SendAsync(request);
	}

	private async Task<SocialPostVisibility> _StoredAsync(Guid accountId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.SocialAccount.AsNoTracking().Where(a => a.Id == accountId).Select(a => a.DefaultVisibility).SingleAsync();
	}

	[Theory]
	[InlineData(SocialProvider.Mastodon, "unlisted", SocialPostVisibility.Unlisted)]
	[InlineData(SocialProvider.Pixelfed, "private", SocialPostVisibility.Private)]
	[InlineData(SocialProvider.Mastodon, "public", SocialPostVisibility.Public)]
	public async Task ItShouldStoreTheVisibilityAndListItOnTheAccount(SocialProvider provider, string wire, SocialPostVisibility expected) {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAccountAsync(tenantId, provider);

		using var response = await this._PutAsync(token, tenantId, accountId.ToString(), new { visibility = wire });

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var updated = await response.Content.ReadFromJsonAsync<SocialAccountVisibilityUpdated>();
		updated.Required().DefaultVisibility.Should().Be(wire);
		(await this._StoredAsync(accountId)).Should().Be(expected);

		using var list = new HttpRequestMessage(HttpMethod.Get, "/social-accounts/").WithSessionToken(token).WithTenantId(tenantId);
		using var listResponse = await this._Http.SendAsync(list);
		var payload = await listResponse.Content.ReadFromJsonAsync<FindSocialAccountsForTenantResponse>();
		payload.Required().Data.Single(item => item.Id == accountId).DefaultVisibility.Should().Be(wire);
	}

	[Fact]
	public async Task ItShouldListNewAccountsAsPublicByDefault() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAccountAsync(tenantId, SocialProvider.Mastodon);

		using var list = new HttpRequestMessage(HttpMethod.Get, "/social-accounts/").WithSessionToken(token).WithTenantId(tenantId);
		using var listResponse = await this._Http.SendAsync(list);
		var payload = await listResponse.Content.ReadFromJsonAsync<FindSocialAccountsForTenantResponse>();

		payload.Required().Data.Single(item => item.Id == accountId).DefaultVisibility.Should().Be("public");
	}

	[Theory]
	[InlineData("direct")]
	[InlineData("PUBLIC")]
	[InlineData("friends")]
	public async Task ItShouldRejectAnUnknownVisibility(string wire) {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAccountAsync(tenantId, SocialProvider.Mastodon);

		using var response = await this._PutAsync(token, tenantId, accountId.ToString(), new { visibility = wire });

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await this._StoredAsync(accountId)).Should().Be(SocialPostVisibility.Public);
	}

	[Fact]
	public async Task ItShouldRejectAMissingVisibility() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAccountAsync(tenantId, SocialProvider.Mastodon);

		using var response = await this._PutAsync(token, tenantId, accountId.ToString(), new { });

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Theory]
	[InlineData(SocialProvider.Bluesky)]
	[InlineData(SocialProvider.DiscordWebhook)]
	public async Task ItShouldRefuseAVisibilityOnAnAccountWithoutTheNotion(SocialProvider provider) {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAccountAsync(tenantId, provider);

		using var response = await this._PutAsync(token, tenantId, accountId.ToString(), new { visibility = "unlisted" });

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Required().TranslationKey.Should().Be("social-account-visibility-unsupported");
		(await this._StoredAsync(accountId)).Should().Be(SocialPostVisibility.Public);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForAnUnknownOrMalformedAccount() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();

		using var unknown = await this._PutAsync(token, tenantId, Guid.NewGuid().ToString(), new { visibility = "unlisted" });
		using var malformed = await this._PutAsync(token, tenantId, "not-a-guid", new { visibility = "unlisted" });

		unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
		malformed.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldNeverChangeAnotherTenantsAccount() {
		var (_, token) = await this._LoginAsAcmeAdminAsync();
		var otherTenantId = await TenantMemberTestHelper.GetTenantIdAsync(this._Fixture, SeedConstants.Tenants.TechStartName);
		var foreignAccount = await this._SeedAccountAsync(otherTenantId, SocialProvider.Mastodon);
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(this._Fixture, SeedConstants.Tenants.AcmeName);

		using var response = await this._PutAsync(token, acmeId, foreignAccount.ToString(), new { visibility = "private" });

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		(await this._StoredAsync(foreignAccount)).Should().Be(SocialPostVisibility.Public);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenWithoutTheManagePermission() {
		var (tenantId, _) = await this._LoginAsAcmeAdminAsync();
		var accountId = await this._SeedAccountAsync(tenantId, SocialProvider.Mastodon);
		var email = await TenantMemberTestHelper.SeedMemberAsync(this._Fixture, tenantId, []);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);

		using var response = await this._PutAsync(token, tenantId, accountId.ToString(), new { visibility = "private" });

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		(await this._StoredAsync(accountId)).Should().Be(SocialPostVisibility.Public);
	}
}
