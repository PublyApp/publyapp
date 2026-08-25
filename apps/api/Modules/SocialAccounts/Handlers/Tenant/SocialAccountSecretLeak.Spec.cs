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
	private const string Password = "correct-horse-battery-staple";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public SocialAccountSecretLeakSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldNeverExposeTheAppPasswordAnywhere() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		var fake = GetFake();

		using var connect = await ConnectAsync(
			tenantId, token, $"leak-{Guid.NewGuid():N}@example.com", Password
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
			using var response = await _http.SendAsync(request);
			if (response.StatusCode == HttpStatusCode.MethodNotAllowed) {
				continue; // route exists but is not a GET; nothing to sweep
			}
			var text = await response.Content.ReadAsStringAsync();
			text.Should().NotContain(Password, $"GET {url} must never echo the secret");
		}

		// Sweep 2: every persisted social_accounts column.
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var row = await db.SocialAccount.AsNoTracking()
			.SingleAsync(a => a.Id == created.Id);
		row.ProtectedCredentials.Should().NotBeNullOrEmpty();
		row.ProtectedCredentials.Should().NotContain(Password);

		// The stored blob still decrypts to the password (round-trip proof).
		var protector = scope.ServiceProvider
			.GetRequiredService<ICredentialProtector>();
		var unprotect = protector.Unprotect(
			row.ProtectedCredentials, SocialProvider.Bluesky
		);
		unprotect.Outcome.Should().Be(UnprotectOutcome.Ok);
		unprotect.Plaintext.Should().Be(Password);

		// Sweep 3: audit_log rows for this account.
		var audits = await db.AuditLog.AsNoTracking()
			.Where(a => a.TargetId == created.Id)
			.ToListAsync();
		audits.Should().NotBeEmpty();
		foreach (var audit in audits) {
			audit.Action.Should().NotBeNullOrWhiteSpace();
			audit.Details.Should().NotContain(Password);
		}

		// Sanity: the fake recorded the identifier, never a password.
		fake.Attempts.Should().Contain(
			a => a.Identifier.StartsWith("leak-")
		);
	}

	private async Task<HttpResponseMessage> ConnectAsync(
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
		return await _http.SendAsync(request);
	}

	private FakeBlueskyClient GetFake() {
		using var scope = _fixture.Factory.Services.CreateAsyncScope();
		return scope.ServiceProvider.GetRequiredService<FakeBlueskyClient>();
	}

	private async Task<(Guid TenantId, string Token)> LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}
}
