using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

// Round-2 review finding 1 (PR #1439): the Epic-D seam adapter itself had zero
// specs — only BlueskyClient was unit-specced. These drive EVERY outcome mapping
// of OpenSessionAsync through the faked IBlueskyClient: an Unprotect failure and
// a Bluesky refusal are account-caused (AccountFailure), network/5xx is Transient
// with NO stored-state change, success carries the live session values. The
// refusal spec also pins the transparent-failure-causes rule: a refused
// session-open flips the stored row to NeedsReconnect with the sanitised cause
// persisted (never a raw provider payload, never the app password).
public sealed class BlueskySessionProviderSpec : IClassFixture<ApiFixture> {
	private const string Password = "provider-spec-app-password";

	private readonly ApiFixture _fixture;

	public BlueskySessionProviderSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReturnOpenedWithLiveSessionValuesOnSuccess() {
		await using var scope = CreateScope();
		var accountId = await SeedConnectedAccountAsync(scope);

		var result = await ResolveProvider(scope)
			.OpenSessionAsync(accountId, CancellationToken.None);

		var opened = result.Should()
			.BeOfType<SocialSessionResult.Opened>().Subject;
		opened.Session.Did.Should().StartWith("did:plc:");
		opened.Session.Handle.Should().EndWith(".test");
		opened.Session.AccessJwt.Should().NotBeNullOrWhiteSpace();
		opened.Session.PdsHost.Should().Be("https://bsky.social");

		await AssertRowUnchangedAsync(scope, accountId);
	}

	[Fact]
	public async Task ItShouldMapARefusedSessionToAccountFailureAndFlipNeedsReconnect() {
		await using var scope = CreateScope();
		const string cause = "Credentials were refused by Bluesky.";
		var fake = ResolveFake(scope);
		fake.NextResult = new BlueskySessionResult.AccountFailure(cause);
		var accountId = await SeedConnectedAccountAsync(scope);

		var result = await ResolveProvider(scope)
			.OpenSessionAsync(accountId, CancellationToken.None);

		var failure = result.Should()
			.BeOfType<SocialSessionResult.AccountFailure>().Subject;
		failure.Cause.Should().Be(cause);

		// Transparent failure causes: the account flips to needs-reconnect and the
		// plain-words cause is persisted for the operator surface.
		await using var verify = CreateFreshDbContext(scope);
		var row = await verify.SocialAccount.AsNoTracking()
			.SingleAsync(a => a.Id == accountId);
		row.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
		row.LastError.Should().Be(cause);
		row.ProtectedCredentials.Should().NotBeEmpty();

		fake.NextResult = null;
	}

	[Fact]
	public async Task ItShouldMapAnUnusableStoredCredentialToAccountFailure() {
		await using var scope = CreateScope();
		var db = ResolveDb(scope);
		var tenantId = await SeedTenantAsync(db);
		db.SocialAccount.Add(new SocialAccount {
			TenantId = tenantId,
			Provider = SocialProvider.Bluesky,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "tampered-blob.test",
			CredentialType = SocialCredentialType.AppPassword,
			ProtectedCredentials = "not-a-valid-protected-blob",
			Status = SocialAccountStatus.Active,
		});
		await db.SaveChangesAsync();
		var accountId = (await db.SocialAccount.AsNoTracking().SingleAsync(
			a => a.DisplayHandle == "tampered-blob.test"
		)).GetRequiredId();

		var result = await ResolveProvider(scope)
			.OpenSessionAsync(accountId, CancellationToken.None);

		var failure = result.Should()
			.BeOfType<SocialSessionResult.AccountFailure>().Subject;
		failure.Cause.Should().Be("no usable stored credential");
		ResolveFake(scope).Attempts.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldMapAMissingSocialAccountToAccountFailure() {
		await using var scope = CreateScope();

		var result = await ResolveProvider(scope).OpenSessionAsync(Guid.NewGuid(), CancellationToken.None);

		var failure = result.Should()
			.BeOfType<SocialSessionResult.AccountFailure>().Subject;
		failure.Cause.Should().Be("social account not found");
	}

	[Fact]
	public async Task ItShouldMapTransientFailureWithoutFlippingTheStoredState() {
		await using var scope = CreateScope();
		var fake = ResolveFake(scope);
		fake.NextResult = new BlueskySessionResult.Transient();
		var accountId = await SeedConnectedAccountAsync(scope);

		var result = await ResolveProvider(scope)
			.OpenSessionAsync(accountId, CancellationToken.None);

		var transient = result.Should()
			.BeOfType<SocialSessionResult.Transient>().Subject;
		transient.Cause.Should().NotBeNullOrWhiteSpace();

		// A transient outage is NOT an account problem: nothing about the stored
		// row may change — jobs infrastructure retries later.
		await using var verify = CreateFreshDbContext(scope);
		var row = await verify.SocialAccount.AsNoTracking()
			.SingleAsync(a => a.Id == accountId);
		row.Status.Should().Be(SocialAccountStatus.Active);
		row.LastError.Should().BeNull();

		fake.NextResult = null;
	}

	private AsyncServiceScope CreateScope() {
		return _fixture.Factory.Services.CreateAsyncScope();
	}

	private static AppDbContext ResolveDb(AsyncServiceScope scope) {
		return scope.ServiceProvider.GetRequiredService<AppDbContext>();
	}

	private static ISocialSessionProvider ResolveProvider(AsyncServiceScope scope) {
		return scope.ServiceProvider.GetRequiredService<ISocialSessionProvider>();
	}

	private static FakeBlueskyClient ResolveFake(AsyncServiceScope scope) {
		return scope.ServiceProvider.GetRequiredService<FakeBlueskyClient>();
	}

	private static AppDbContext CreateFreshDbContext(AsyncServiceScope scope) {
		var reference = ResolveDb(scope);
		var connectionString = reference.Database.GetConnectionString();
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private static async Task<Guid> SeedTenantAsync(AppDbContext db) {
		var tenant = new Tenant {
			Name = $"Session Provider {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}

	private static async Task<Guid> SeedConnectedAccountAsync(AsyncServiceScope scope) {
		var db = ResolveDb(scope);
		var tenantId = await SeedTenantAsync(db);
		var protector = scope.ServiceProvider
			.GetRequiredService<ICredentialProtector>();
		var account = new SocialAccount {
			TenantId = tenantId,
			Provider = SocialProvider.Bluesky,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = $"session-provider-{Guid.NewGuid():N}"[..24] + ".test",
			CredentialType = SocialCredentialType.AppPassword,
			ProtectedCredentials = protector.Protect(
				Password, SocialProvider.Bluesky
			),
			Status = SocialAccountStatus.Active,
			LastSuccessAt = DateTime.UtcNow,
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private static async Task AssertRowUnchangedAsync(
		AsyncServiceScope scope,
		Guid accountId
	) {
		await using var verify = CreateFreshDbContext(scope);
		var row = await verify.SocialAccount.AsNoTracking()
			.SingleAsync(a => a.Id == accountId);
		row.Status.Should().Be(SocialAccountStatus.Active);
		row.LastError.Should().BeNull();
		row.LastSuccessAt.Should().NotBeNull();
	}
}
