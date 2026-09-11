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

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// Proof 2 (plan Task 5): tenant isolation on every id-addressed route and on the
// list. Tenant B's admin token + X-Tenant-Id B against tenant A's account id must
// yield 404 everywhere, and A's account must be absent from B's list.
public sealed class SocialAccountIsolationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public SocialAccountIsolationSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task ItShouldReturn404AndHideForeignAccountsFromAnotherTenant() {
		var (tenantAId, tokenA, accountId) = await _ConnectForAcmeAsync();
		var (tenantBId, tokenB) = await _LoginAsTechStartAdminAsync();

		// Id-addressed routes with B's credentials on A's account → 404.
		var probes = new[] {
			($"/social-accounts/{accountId}/reconnect", "POST", (object?)new {
				appPassword = "whatever-password",
			}),
			($"/social-accounts/{accountId}/disconnect", "POST", null),
			($"/social-accounts/{accountId}/projects", "PUT", (object?)new {
				projectIds = Array.Empty<Guid>(),
			}),
		};
		foreach (var (url, method, payload) in probes) {
			using var request = new HttpRequestMessage(
				new HttpMethod(method), url
			).WithSessionToken(tokenB).WithTenantId(tenantBId);
			if (payload is not null) {
				request.Content = JsonContent.Create(payload);
			}
			using var response = await _Http.SendAsync(request);
			response.StatusCode.Should().Be(
				HttpStatusCode.NotFound,
				$"tenant B hitting {method} {url} on A's account must 404"
			);
		}

		// A's account must not appear in B's list either.
		using var listRequest = new HttpRequestMessage(HttpMethod.Get, "/social-accounts/")
			.WithSessionToken(tokenB)
			.WithTenantId(tenantBId);
		using var listResponse = await _Http.SendAsync(listRequest);
		listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		var listBody = await listResponse.Content.ReadAsStringAsync();
		listBody.Should().NotContain(accountId.ToString());

		// And A's row was untouched by all of B's attempts.
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var row = await db.SocialAccount.AsNoTracking()
			.SingleAsync(a => a.Id == accountId);
		row.Status.Should().Be(SocialAccountStatus.Active);
		row.ProtectedCredentials.Should().NotBeEmpty();
	}

	[Fact]
	public async Task ItShouldListEveryAccountForItsOwnTenantOnly() {
		var (acmeTenantId, acmeToken, firstId) = await _ConnectForAcmeAsync();

		// Second account, same tenant.
		Guid secondId;
		using (var connectRequest = new HttpRequestMessage(
			HttpMethod.Post, "/social-accounts/connect"
		).WithSessionToken(acmeToken).WithTenantId(acmeTenantId)) {
			connectRequest.Content = JsonContent.Create(new {
				identifier = $"second-{Guid.NewGuid():N}@example.com",
				appPassword = "app-password-456",
			});
			using var connectResponse = await _Http.SendAsync(connectRequest);
			connectResponse.EnsureSuccessStatusCode();
			var created = await connectResponse.Content
				.ReadFromJsonAsync<SocialAccountCreated>();
			secondId = created!.Id;
		}

		using var listRequest = new HttpRequestMessage(HttpMethod.Get, "/social-accounts/")
			.WithSessionToken(acmeToken)
			.WithTenantId(acmeTenantId);
		using var listResponse = await _Http.SendAsync(listRequest);
		listResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var body = await listResponse.Content.ReadFromJsonAsync<
			Handlers.Tenant.FindSocialAccountsForTenantResponse>();
		body.Should().NotBeNull();
		Assert.NotNull(body);
		var ids = body.Data.Select(item => item.Id).ToList();
		ids.Should().Contain(firstId).And.Contain(secondId);
	}

	private async Task<(Guid TenantId, string Token, Guid AccountId)>
		_ConnectForAcmeAsync() {
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
			identifier = $"iso-{Guid.NewGuid():N}@example.com",
			appPassword = "app-password-123",
		});
		using var response = await _Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
		var created = await response.Content.ReadFromJsonAsync<SocialAccountCreated>();
		return (tenantId, token, created!.Id);
	}

	private async Task<(Guid TenantId, string Token)>
		_LoginAsTechStartAdminAsync() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_Http, staffToken, SeedConstants.Tenants.TechStartName
		);
		var token = await _AuthClient.LoginAsync(
			TestConstants.TechStartAdminEmail, TestConstants.SeedPassword
		);
		return (tenantId, token);
	}
}
