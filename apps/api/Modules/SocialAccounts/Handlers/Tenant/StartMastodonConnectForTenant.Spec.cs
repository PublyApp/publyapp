using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// POST /social-accounts/mastodon/start was never hit by the integration suite
// (see docs/records/2026-10-28-analysis-endpoint-coverage.md). The full mastodon
// connect flow is covered against a recording fake in MastodonOAuthService.Spec;
// THIS spec pins the HTTP contract: validators, the SSRF host guard surfaced as a
// 422, the provider-unavailable 503, and the authorizations.
//
// The success path (200 + AuthorizeUrl, and the Refused 422 for an instance that
// answers 4xx) needs a live Mastodon instance and is deliberately NOT faked here.
public sealed class StartMastodonConnectForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public StartMastodonConnectForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	// Every one of these is rejected by MastodonHostGuard before any network call:
	// http scheme, single label, IP literals, an explicit port, and a reserved suffix.
	[Theory]
	[InlineData("http://mastodon.social")]
	[InlineData("localhost")]
	[InlineData("10.0.0.1")]
	[InlineData("169.254.169.254")]
	[InlineData("internal.local")]
	[InlineData("not-a-host")]
	[InlineData("https://mastodon.social:8443")]
	public async Task ItShouldRejectAnUnsafeInstanceHostWithoutContactingIt(
		string instance
	) {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._SendAsync(token, acmeId, new { instance });

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("mastodon-instance-invalid");
		problem.Errors.Should().ContainKey("instance");
		problem.Errors["instance"].Should().NotBeNullOrEmpty();
		(await this._OAuthStateCountAsync(acmeId)).Should().Be(
			0,
			"a refused instance stores nothing"
		);
	}

	[Fact]
	public async Task ItShouldRejectAnEmptyInstance() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._SendAsync(token, acmeId, new { instance = "" });

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("request-body-validation-failed");
		problem.Errors.Should().ContainKey("Instance");
	}

	[Fact]
	public async Task ItShouldRejectAnInstanceThatIsNotAString() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._SendAsync(token, acmeId, new { instance = 42 });

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Instance");
	}

	[Fact]
	public async Task ItShouldRejectAnInstanceLongerThanTheWireLimit() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var tooLong = $"{new string('a', 300)}.social";
		using var response = await this._SendAsync(
			token,
			acmeId,
			new { instance = tooLong }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Instance");
	}

	[Fact]
	public async Task ItShouldRejectAnEmptyProvider() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._SendAsync(
			token,
			acmeId,
			new { instance = "mastodon.social", provider = "" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Provider");
		(await this._OAuthStateCountAsync(acmeId)).Should().Be(0);
	}

	// A well-formed host that cannot be reached is a provider failure (503), not a
	// validation error: the message names the cause so the user knows to try again.
	[Fact]
	public async Task ItShouldReturnProviderUnavailableWhenTheInstanceCannotBeReached() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		// RFC 2606 reserved TLD: guaranteed not to resolve, so the connect attempt
		// fails at the transport layer exactly like a dead instance.
		using var response = await this._SendAsync(
			token,
			acmeId,
			new { instance = "unreachable.invalid" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("provider-unreachable");
		(await this._OAuthStateCountAsync(acmeId)).Should().Be(
			0,
			"nothing was stored for an unreachable instance"
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutASession() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			StartMastodonConnectForTenantSpec._StartUrl
		).WithTenantId(acmeId);
		request.Content = JsonContent.Create(new { instance = "mastodon.social" });
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWithoutTheTenantHeader() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			StartMastodonConnectForTenantSpec._StartUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { instance = "mastodon.social" });
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("tenant-id-required");
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForATenantUserWithoutTheManagePermission() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var email = await TenantMemberTestHelper.SeedMemberAsync(this._Fixture, acmeId, []);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);

		using var response = await this._SendAsync(
			token,
			acmeId,
			new { instance = "mastodon.social" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(
			"user-does-not-have-the-necessary-permissions"
		);
		(await this._OAuthStateCountAsync(acmeId)).Should().Be(0);
	}

	// The route is tenant-scoped: a staff session has no tenant account and is refused
	// by the tenant filter, not served by the staff bypass.
	[Fact]
	public async Task ItShouldReturnForbiddenForAStaffAccount() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(
			token,
			acmeId,
			new { instance = "mastodon.social" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static string _StartUrl {
		get {
			return Routes.SocialAccounts.ForTenant.Root
				+ Routes.SocialAccounts.ForTenant.MastodonStart;
		}
	}

	private async Task<HttpResponseMessage> _SendAsync(
		string token,
		Guid tenantId,
		object body
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			StartMastodonConnectForTenantSpec._StartUrl
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(body);
		return await this._Http.SendAsync(request);
	}

	private async Task<int> _OAuthStateCountAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.OAuthState
			.AsNoTracking()
			.CountAsync(state => state.TenantId == tenantId);
	}
}
