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

// POST /social-accounts/mastodon/callback was never hit by the integration suite
// (see docs/records/2026-10-28-analysis-endpoint-coverage.md). The handler's job is
// to consume the single-use OAuth state and exchange the code; this spec pins every
// arm that does not need a live instance: both validator rules, the invalid-state
// refusal, and the authorizations.
//
// Untestable without a live provider (deliberately not faked here): the success 200,
// the Refused 422 (the instance answering 4xx), the provider-unavailable 503, the
// already-consumed/second-use refusal, and a valid state whose app registration was
// deleted. Those outcomes are covered at the service level in MastodonOAuthService.Spec
// against a recording fake.
public sealed class CompleteMastodonConnectForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CompleteMastodonConnectForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	// The state is the anti-CSRF token of the flow: an unknown one is refused with a
	// field-level cause, and nothing is stored.
	[Fact]
	public async Task ItShouldRejectAnUnknownState() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var accountsBefore = await this._SocialAccountCountAsync(acmeId);

		using var response = await this._SendAsync(
			token,
			acmeId,
			new { code = "the-code", state = "never-issued-state" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("mastodon-oauth-state-invalid");
		problem.Errors.Should().ContainKey("state");
		problem.Errors["state"].Should().NotBeNullOrEmpty();
		(await this._SocialAccountCountAsync(acmeId)).Should().Be(
			accountsBefore,
			"an invalid state stores no account"
		);
	}

	[Fact]
	public async Task ItShouldRejectAnEmptyCode() {
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
			new { code = "", state = "any-state" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("request-body-validation-failed");
		problem.Errors.Should().ContainKey("Code");
	}

	[Fact]
	public async Task ItShouldRejectAnEmptyState() {
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
			new { code = "the-code", state = "" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("State");
	}

	[Fact]
	public async Task ItShouldRejectACodeLongerThanTheWireLimit() {
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
			new { code = new string('c', 2049), state = "any-state" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Code");
	}

	[Fact]
	public async Task ItShouldRejectAStateLongerThanTheWireLimit() {
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
			new { code = "the-code", state = new string('s', 257) }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("State");
	}

	[Fact]
	public async Task ItShouldRejectACodeThatIsNotAString() {
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
			new { code = 123, state = "any-state" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Code");
	}

	// A state minted for ANOTHER tenant must not be consumable here. Minting one
	// requires a live instance, so this arm is covered at the service level
	// (MastodonOAuthService.Spec) instead of through HTTP.

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutASession() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CompleteMastodonConnectForTenantSpec._CallbackUrl
		).WithTenantId(acmeId);
		request.Content = JsonContent.Create(new { code = "the-code", state = "any-state" });
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
			CompleteMastodonConnectForTenantSpec._CallbackUrl
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { code = "the-code", state = "any-state" });
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
			new { code = "the-code", state = "any-state" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(
			"user-does-not-have-the-necessary-permissions"
		);
	}

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
			new { code = "the-code", state = "any-state" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	private static string _CallbackUrl {
		get {
			return Routes.SocialAccounts.ForTenant.Root
				+ Routes.SocialAccounts.ForTenant.MastodonCallback;
		}
	}

	private async Task<HttpResponseMessage> _SendAsync(
		string token,
		Guid tenantId,
		object body
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CompleteMastodonConnectForTenantSpec._CallbackUrl
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(body);
		return await this._Http.SendAsync(request);
	}

	private async Task<int> _SocialAccountCountAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.SocialAccount
			.AsNoTracking()
			.CountAsync(account => account.TenantId == tenantId);
	}
}
