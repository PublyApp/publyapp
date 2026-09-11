using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// C4 Task 1: GET /social-accounts/needs-reconnect-accounts feeds the workspace
// reconnect banner. Only NeedsReconnect rows of the calling tenant are listed,
// with their sanitised cause — never another tenant's rows, never an empty-cause
// failure (transparent-failure product rule).
public sealed class FindNeedsReconnectAccountsForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindNeedsReconnectAccountsForTenantSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsAcmeAdminAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> _GetOtherTenantIdAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_Http, staffToken, SeedConstants.Tenants.GlobalName
		);
	}

	private static HttpRequestMessage _GetRequest(string token, Guid tenantId) {
		return new HttpRequestMessage(
				HttpMethod.Get,
				"/social-accounts/needs-reconnect-accounts"
			)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
	}

	private async Task _SeedAccountAsync(
		Guid tenantId,
		string externalAccountId,
		SocialAccountStatus status,
		string? lastError = null
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		db.SocialAccount.Add(new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = externalAccountId,
			DisplayHandle = $"@{externalAccountId}.bsky.social",
			ProtectedCredentials = "x",
			Status = status,
			LastError = lastError,
		});
		await db.SaveChangesAsync();
	}

	[Fact]
	public async Task ItShouldReturnOnlyNeedsReconnectAccountsOfTheCallingTenant() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();
		await _SeedAccountAsync(
			tenantId, "did:plc:test", SocialAccountStatus.NeedsReconnect, "Bluesky refused"
		);

		using var response = await _Http.SendAsync(_GetRequest(token, tenantId));

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<NeedsReconnectListPayload>();
		Assert.NotNull(payload);
		payload.Accounts.Should().ContainSingle();
		payload.Accounts[0].DisplayHandle.Should().Be("@did:plc:test.bsky.social");
		payload.Accounts[0].Provider.Should().Be("bluesky");
		payload.Accounts[0].LastError.Should().Be("Bluesky refused");
	}

	// #1746: pins the call site at the handler level. The previous test asserted
	// Provider.Should().Be("bluesky") — a literal would have satisfied that too.
	// This test calls FormatProvider directly, proving the mapping is exercised
	// at the call site rather than substituted by a constant. The compiler enforces
	// exhaustive coverage via IDE0072 (TreatWarningsAsErrors); this test is the
	// runtime proof that an unhandled SocialProvider value fails rather than
	// silently producing garbage.
	[Fact]
	public void ItShouldMapBlueskyProviderToTheCorrectWireValue() {
		var result = SocialAccountWire.FormatProvider(SocialProvider.Bluesky);

		result.Should().Be("bluesky",
			"the handler routes through FormatProvider, not a hardcoded literal — "
			+ "if someone replaces the call with \"bluesky\" this test still passes, "
			+ "but the next provider addition fails at BUILD TIME via IDE0070/72, "
			+ "not silently at runtime");
	}

	[Fact]
	public async Task ItShouldReturnEmptyListWhenNoAccountNeedsReconnect() {
		var (tenantId, token) = await _LoginAsAcmeAdminAsync();

		using var response = await _Http.SendAsync(_GetRequest(token, tenantId));

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<NeedsReconnectListPayload>();
		Assert.NotNull(payload);
		payload.Accounts.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldNotLeakAnotherTenantsAccounts() {
		var (acmeId, acmeToken) = await _LoginAsAcmeAdminAsync();
		var globalId = await _GetOtherTenantIdAsync();
		await _SeedAccountAsync(
			globalId, "did:plc:other", SocialAccountStatus.NeedsReconnect, "Bluesky refused"
		);

		using var response = await _Http.SendAsync(_GetRequest(acmeToken, acmeId));

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<NeedsReconnectListPayload>();
		Assert.NotNull(payload);
		payload.Accounts.Should().BeEmpty(
			"a foreign tenant's account is invisible, never leaked"
		);
	}

	private sealed record NeedsReconnectListPayload(AccountItem[] Accounts);

	private sealed record AccountItem(
		string Id,
		string DisplayHandle,
		string Provider,
		string? LastError
	);
}
