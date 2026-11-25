using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>
/// #2509 review minor 13: develop silently fell through to Bluesky for a provider it
/// did not recognise; the routing table now refuses it. The table covers the four known
/// networks, so an out-of-range value (corrupted row) is the only case that reaches the
/// branch, and it must be an AccountFailure that names the network. The case goes through
/// the public OpenSessionAsync with a real row, not through a test-only helper.
/// </summary>
public sealed class RoutingSocialSessionAdapterSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public RoutingSocialSessionAdapterSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReturnAnAccountFailureForANetworkWithNoSessionProvider() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var services = scope.ServiceProvider;
		var db = services.GetRequiredService<AppDbContext>();

		// A provider value outside the four known networks is what a corrupted row looks
		// like; the database stores the enum as an int, so it can exist.
		var account = new SocialAccount {
			TenantId = await RoutingSocialSessionAdapterSpec._SeedTenantAsync(db),
			Provider = (SocialProvider)99,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@corrupt.example",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var router = ActivatorUtilities.CreateInstance<RoutingSocialSessionAdapter>(services);

		var result = await router.OpenSessionAsync(account.GetRequiredId(), CancellationToken.None);

		var failure = result.Should()
			.BeOfType<SocialSessionResult.AccountFailure>().Subject;
		failure.Cause.Should().Contain("no session provider is registered")
			.And.Contain("99");
	}

	private static async Task<Guid> _SeedTenantAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"Routing Provider {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}
}
