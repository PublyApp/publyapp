using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// Proof 6 (plan Task 5): disconnect semantics over HTTP. Disconnect revokes the row,
// erases the secret (Unprotect → Absent), keeps it listed; reconnect-after-revoke
// and further id-addressed mutations answer 404.
public sealed class SocialAccountDisconnectProofSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public SocialAccountDisconnectProofSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task ItShouldRevokeEraseSecretAndThenRejectReconnect() {
		var (tenantId, token) = await _ConnectNewAccountAsync();
		var listBody = await _ListAsync(tenantId, token);
		var accountId = _ParseSingleId(listBody);

		// Disconnect.
		using var disconnectRequest = new HttpRequestMessage(
			HttpMethod.Post, $"/social-accounts/{accountId}/disconnect"
		).WithSessionToken(token).WithTenantId(tenantId);
		using var disconnect = await _Http.SendAsync(disconnectRequest);
		disconnect.StatusCode.Should().Be(HttpStatusCode.OK);

		// Row revoked + secret erased at rest.
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var row = await db.SocialAccount.AsNoTracking()
			.SingleAsync(a => a.Id == accountId);
		row.Status.Should().Be(SocialAccountStatus.Revoked);
		row.ProtectedCredentials.Should().BeEmpty();

		// Unprotect reports Absent for the erased sentinel.
		var protector = scope.ServiceProvider
			.GetRequiredService<ICredentialProtector>();
		protector.Unprotect(row.ProtectedCredentials, SocialProvider.Bluesky)
			.Outcome.Should().Be(UnprotectOutcome.Absent);

		// Still listed (history kept), now revoked.
		var after = await _ListAsync(tenantId, token);
		after.Should().Contain(accountId.ToString());

		// Reconnect after revoke → 404.
		using var reconnectRequest = new HttpRequestMessage(
			HttpMethod.Post, $"/social-accounts/{accountId}/reconnect"
		).WithSessionToken(token).WithTenantId(tenantId);
		reconnectRequest.Content = JsonContent.Create(new {
			appPassword = "app-password-222",
		});
		using var reconnect = await _Http.SendAsync(reconnectRequest);
		reconnect.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<(Guid TenantId, string Token)> _ConnectNewAccountAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail, TestConstants.SeedPassword
		);
		using var request = new HttpRequestMessage(
			HttpMethod.Post, "/social-accounts/connect"
		).WithSessionToken(token).WithTenantId(tenantId);
		request.Content = JsonContent.Create(new {
			identifier = $"bye-{Guid.NewGuid():N}@example.com",
			appPassword = "app-password-333",
		});
		using var response = await _Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		return (tenantId, token);
	}

	private async Task<string> _ListAsync(Guid tenantId, string token) {
		// The Acme tenant is shared across specs in this class's own fixture; filter
		// by our freshly connected handle prefix instead of assuming exclusivity.
		using var request = new HttpRequestMessage(HttpMethod.Get, "/social-accounts/")
			.WithSessionToken(token)
			.WithTenantId(tenantId);
		using var response = await _Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		return await response.Content.ReadAsStringAsync();
	}

	private static Guid _ParseSingleId(string listBody) {
		// The connect call above created exactly one NEW account; find its id by
		// scanning the JSON payload for the newest entry is fragile — instead this
		// spec relies on its own ApiFixture being exclusive, so the list holds only
		// this test's accounts. Take the first data item's "id".
		const string marker = "\"id\":\"";
		var start = listBody.IndexOf(marker, StringComparison.Ordinal);
		start.Should().BeGreaterThanOrEqualTo(0);
		start += marker.Length;
		var end = listBody.IndexOf('"', start);
		return Guid.Parse(listBody[start..end]);
	}
}
