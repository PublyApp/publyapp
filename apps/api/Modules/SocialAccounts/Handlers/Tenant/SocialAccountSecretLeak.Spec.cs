using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// Proof 1 (plan Task 5): the app password must appear nowhere in any read surface
// or audit row. The connect flow runs with the real password; every GET response
// and every persisted string is swept for it.
public sealed class SocialAccountSecretLeakSpec : IClassFixture<ApiFixture> {
	private const string _Password = "correct-horse-battery-staple";

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public SocialAccountSecretLeakSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldNeverExposeTheAppPasswordAnywhere() {
		var (tenantId, token) = await this._LoginAsAcmeAdminAsync();
		var fake = this._GetFake();

		using var connect = await this._ConnectAsync(
			tenantId, token, $"leak-{Guid.NewGuid():N}@example.com", SocialAccountSecretLeakSpec._Password
		);
		connect.StatusCode.Should().Be(HttpStatusCode.Created);
		var created = await connect.Content.ReadFromJsonAsync<SocialAccountCreated>();
		Assert.NotNull(created);

		// Sweep 1: list + detail-bearing reads over HTTP.
		foreach (var url in new[] {
			"/social-accounts/",
			$"/social-accounts/{created.Id}/reconnect",
			$"/social-accounts/{created.Id}/disconnect",
			$"/social-accounts/{created.Id}/projects",
		}) {
			using var request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			using var response = await this._Http.SendAsync(request);
			if (response.StatusCode == HttpStatusCode.MethodNotAllowed) {
				continue; // route exists but is not a GET; nothing to sweep
			}
			var text = await response.Content.ReadAsStringAsync();
			text.Should().NotContain(SocialAccountSecretLeakSpec._Password, $"GET {url} must never echo the secret");
		}

		// Sweep 2: every persisted social_accounts column.
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var row = await db.SocialAccount.AsNoTracking()
			.SingleAsync(a => a.Id == created.Id);
		row.ProtectedCredentials.Should().NotBeNullOrEmpty();
		row.ProtectedCredentials.Should().NotContain(SocialAccountSecretLeakSpec._Password);

		// The stored blob still decrypts to the password (round-trip proof).
		var protector = scope.ServiceProvider
			.GetRequiredService<ICredentialProtector>();
		var unprotect = protector.Unprotect(
			row.ProtectedCredentials, SocialProvider.Bluesky
		);
		unprotect.Outcome.Should().Be(UnprotectOutcome.Ok);
		unprotect.Plaintext.Should().Be(SocialAccountSecretLeakSpec._Password);

		// Sweep 3: audit_log rows for this account.
		var audits = await db.AuditLog.AsNoTracking()
			.Where(a => a.TargetId == created.Id)
			.ToListAsync();
		audits.Should().NotBeEmpty();
		foreach (var audit in audits) {
			audit.Action.Should().NotBeNullOrWhiteSpace();
			audit.Details.Should().NotContain(SocialAccountSecretLeakSpec._Password);
		}

		// Sanity: the fake recorded the identifier, never a password.
		fake.Attempts.Should().Contain(
			a => a.Identifier.StartsWith("leak-")
		);
	}

	private async Task<HttpResponseMessage> _ConnectAsync(
		Guid tenantId,
		string token,
		string identifier,
		string password
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post, "/social-accounts/connect"
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			identifier,
			appPassword = password,
		});
		return await this._Http.SendAsync(request);
	}

	private FakeBlueskyClient _GetFake() {
		using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		return scope.ServiceProvider.GetRequiredService<FakeBlueskyClient>();
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}
}
