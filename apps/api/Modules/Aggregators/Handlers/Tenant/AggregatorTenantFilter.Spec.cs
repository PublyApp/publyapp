using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Aggregators.Fakes;
using PublyApp.Api.Modules.Aggregators.Ports;
using PublyApp.Api.Modules.Aggregators.Services;

using Xunit;

namespace PublyApp.Api.Modules.Aggregators.Handlers.Tenant;

// #2460: the aggregators module no longer writes a TenantId predicate, the global tenant
// filter alone isolates tenants. Two tenants, each with its own key, through the real
// endpoints; plus the service refusing a context that carries no tenant.
public sealed class AggregatorTenantFilterSpec : IClassFixture<ApiFixture> {
	private const string _Url = "/aggregators/zernio/connection";

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public AggregatorTenantFilterSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldKeepEachTenantsKeySeparateWithoutAHandWrittenPredicate() {
		var (tenantA, tokenA) = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var (tenantB, tokenB) = await this._LoginAsync(SeedConstants.Tenants.TechStartName, TestConstants.TechStartAdminEmail);
		var keyA = $"sk_{Guid.NewGuid():N}aaaa";
		var keyB = $"sk_{Guid.NewGuid():N}bbbb";
		var fake = this._Fixture.Factory.Services.GetRequiredService<FakeAggregatorServer>();
		fake.ValidKeys.Add(keyA);
		fake.ValidKeys.Add(keyB);
		(await this._SendAsync(HttpMethod.Put, tenantA, tokenA, new { apiKey = keyA })).StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._SendAsync(HttpMethod.Put, tenantB, tokenB, new { apiKey = keyB })).StatusCode.Should().Be(HttpStatusCode.OK);

		(await this._ListTextAsync(tenantA, tokenA)).Should().Contain("aaaa").And.NotContain("bbbb");
		(await this._ListTextAsync(tenantB, tokenB)).Should().Contain("bbbb").And.NotContain("aaaa");

		(await this._SendAsync(HttpMethod.Delete, tenantB, tokenB)).StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._ListTextAsync(tenantA, tokenA)).Should().Contain("aaaa");
		(await this._SendAsync(HttpMethod.Delete, tenantA, tokenA)).StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldRefuseToRunOnAContextWithoutATenant() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider.GetRequiredService<AggregatorConnectionService>();
		scope.ServiceProvider.GetRequiredService<AppDbContext>().TenantId.Should().BeNull();

		var calls = new Func<Task>[] {
			() => service.FindAsync(CancellationToken.None),
			() => service.SaveAsync(AggregatorKind.Zernio, "sk_unscoped", CancellationToken.None),
			() => service.TestAsync(AggregatorKind.Zernio, CancellationToken.None),
			() => service.RemoveAsync(AggregatorKind.Zernio, CancellationToken.None),
		};
		foreach (var call in calls) {
			await call.Should().ThrowAsync<InvalidOperationException>();
		}
	}

	private async Task<string> _ListTextAsync(Guid tenantId, string token) {
		using var request = new HttpRequestMessage(HttpMethod.Get, "/aggregators/").WithSessionToken(token).WithTenantId(tenantId);
		using var response = await this._Http.SendAsync(request);
		return await response.Content.ReadAsStringAsync();
	}

	private async Task<HttpResponseMessage> _SendAsync(HttpMethod method, Guid tenantId, string token, object? payload = null) {
		using var request = new HttpRequestMessage(method, AggregatorTenantFilterSpec._Url).WithSessionToken(token).WithTenantId(tenantId);
		if (payload is not null) {
			request.Content = JsonContent.Create(payload);
		}

		return await this._Http.SendAsync(request);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsync(string tenantName, string email) {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(this._Http, staffToken, tenantName);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		using var _ = await this._SendAsync(HttpMethod.Delete, tenantId, token);
		return (tenantId, token);
	}
}
