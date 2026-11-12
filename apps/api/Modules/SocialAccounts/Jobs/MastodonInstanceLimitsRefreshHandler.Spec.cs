using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Jobs;

// #2186: the daily refresh of instance limits, against a recording fake instance client
// (no network) and a real ephemeral Postgres. Every spec uses its own unique host names, so
// the shared fixture (other specs' accounts exist on other hosts) never interferes.
public sealed class MastodonInstanceLimitsRefreshHandlerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public MastodonInstanceLimitsRefreshHandlerSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private sealed class RecordingClient : IMastodonClient {
		public Dictionary<string, MastodonInstanceLimits?> LimitsByHost { get; } = [];

		public HashSet<string> ThrowingHosts { get; } = [];

		public bool ThrowEverywhere { get; set; }

		public List<string> Requested { get; } = [];

		public Task<MastodonInstanceLimits?> GetInstanceLimitsAsync(string host, CancellationToken cancellationToken) {
			this.Requested.Add(host);
			if (this.ThrowEverywhere || this.ThrowingHosts.Contains(host)) {
				throw new InvalidOperationException("unexpected failure");
			}

			return Task.FromResult(this.LimitsByHost.GetValueOrDefault(host));
		}

		public Task<MastodonResult<MastodonApp>> RegisterAppAsync(string host, string redirectUri, string scopes, CancellationToken cancellationToken) {
			throw new InvalidOperationException("not used");
		}

		public Task<MastodonResult<string>> ExchangeCodeAsync(string host, MastodonApp app, string redirectUri, string code, string? codeVerifier, CancellationToken cancellationToken) {
			throw new InvalidOperationException("not used");
		}

		public Task<bool> SupportsPkceAsync(string host, CancellationToken cancellationToken) {
			throw new InvalidOperationException("not used");
		}

		public Task<MastodonResult<MastodonAccountInfo>> VerifyCredentialsAsync(string host, string accessToken, CancellationToken cancellationToken) {
			throw new InvalidOperationException("not used");
		}

		public Task RevokeAsync(string host, MastodonApp app, string accessToken, CancellationToken cancellationToken) {
			throw new InvalidOperationException("not used");
		}
	}

	private async Task<(AppDbContext Db, AsyncServiceScope Scope)> _NewAsync() {
		var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		return (scope.ServiceProvider.GetRequiredService<AppDbContext>(), scope);
	}

	private static async Task<Guid> _TenantAsync(AppDbContext db) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"limits-refresh-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		return tenant.GetRequiredId();
	}

	private static async Task<Guid> _AccountAsync(
		AppDbContext db,
		Guid tenantId,
		string host,
		SocialProvider provider = SocialProvider.Mastodon,
		SocialAccountStatus status = SocialAccountStatus.Active,
		string? overrides = null
	) {
		var account = new SocialAccount {
			TenantId = tenantId,
			Provider = provider,
			ExternalAccountId = $"{Random.Shared.NextInt64(1000, 999999)}@{host}",
			DisplayHandle = $"someone@{host}",
			ProtectedCredentials = "enc-spec-blob",
			Status = status,
			CapabilityOverrides = overrides,
		};
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		return account.GetRequiredId();
	}

	private static MastodonInstanceLimitsRefreshHandler _Handler(AppDbContext db, IMastodonClient client) {
		return new MastodonInstanceLimitsRefreshHandler(db, client, NullLogger<MastodonInstanceLimitsRefreshHandler>.Instance);
	}

	private static JobContext _Context() {
		return new JobContext {
			JobId = Guid.NewGuid(),
			JobType = MastodonInstanceLimitsRefreshHandler.JobKey,
			Payload = "{}",
			Attempts = 0,
			MaxAttempts = 3,
		};
	}

	private async Task<SocialAccount> _ReadAsync(Guid id) {
		var (db, scope) = await this._NewAsync();
		await using var _ = scope;
		return await db.SocialAccount.AsNoTracking().SingleAsync(a => a.Id == id);
	}

	[Fact]
	public async Task ItShouldRefreshEveryAccountOnAServerWithOneRequestPerServer() {
		var (db, scope) = await this._NewAsync();
		await using var _ = scope;
		var host = $"refresh-{Guid.NewGuid():N}.example";
		var first = await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, await MastodonInstanceLimitsRefreshHandlerSpec._TenantAsync(db), host);
		var second = await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, await MastodonInstanceLimitsRefreshHandlerSpec._TenantAsync(db), host);
		var client = new RecordingClient();
		client.LimitsByHost[host] = new MastodonInstanceLimits(9000, 7, 23, 5_000_000, ["image/png"]);

		var outcome = await MastodonInstanceLimitsRefreshHandlerSpec._Handler(db, client)
			.HandleAsync(MastodonInstanceLimitsRefreshHandlerSpec._Context(), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.Success>();
		client.Requested.Count(requested => requested == host).Should().Be(1, "two accounts share the server");
		foreach (var id in new[] { first, second }) {
			var account = await this._ReadAsync(id);
			var capability = ProviderCapabilityRegistry.Resolve(account);
			capability.TextLimits.Single().Max.Should().Be(9000);
			capability.MaxImages.Should().Be(7);
			account.CapabilityRefreshedAt.Should().NotBeNull();
		}
	}

	[Fact]
	public async Task ItShouldKeepTheLastKnownLimitsWhenTheServerAdvertisesNothing() {
		var (db, scope) = await this._NewAsync();
		await using var _ = scope;
		var host = $"quiet-{Guid.NewGuid():N}.example";
		var known = CapabilityOverridesFactory.ForMastodon(1234, 3, 23, null, null);
		var id = await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(
			db, await MastodonInstanceLimitsRefreshHandlerSpec._TenantAsync(db), host, overrides: known
		);
		var client = new RecordingClient();
		client.LimitsByHost[host] = null;

		await MastodonInstanceLimitsRefreshHandlerSpec._Handler(db, client)
			.HandleAsync(MastodonInstanceLimitsRefreshHandlerSpec._Context(), CancellationToken.None);

		client.Requested.Should().Contain(host);
		var account = await this._ReadAsync(id);
		ProviderCapabilityRegistry.Resolve(account).TextLimits.Single().Max
			.Should().Be(1234, "an unreachable or silent server never reverts the limits");
		account.CapabilityRefreshedAt.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldOnlyRefreshTheServersOfLiveFediverseAccounts() {
		var (db, scope) = await this._NewAsync();
		await using var _ = scope;
		var tenantId = await MastodonInstanceLimitsRefreshHandlerSpec._TenantAsync(db);
		var revokedHost = $"revoked-{Guid.NewGuid():N}.example";
		var blueskyHost = $"bsky-{Guid.NewGuid():N}.example";
		var liveHost = $"live-{Guid.NewGuid():N}.example";
		var revoked = await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, tenantId, revokedHost, status: SocialAccountStatus.Revoked);
		await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, tenantId, blueskyHost, SocialProvider.Bluesky);
		await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, tenantId, liveHost, status: SocialAccountStatus.NeedsReconnect);
		var client = new RecordingClient();
		var limits = new MastodonInstanceLimits(777, 2, 23, null, null);
		client.LimitsByHost[revokedHost] = limits;
		client.LimitsByHost[blueskyHost] = limits;
		client.LimitsByHost[liveHost] = limits;

		await MastodonInstanceLimitsRefreshHandlerSpec._Handler(db, client)
			.HandleAsync(MastodonInstanceLimitsRefreshHandlerSpec._Context(), CancellationToken.None);

		client.Requested.Should().Contain(liveHost, "a paused account still publishes after a reconnect");
		client.Requested.Should().NotContain(revokedHost).And.NotContain(blueskyHost);
		(await this._ReadAsync(revoked)).CapabilityOverrides.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldUseTheNetworkOfEachAccountForTheSameHost() {
		var (db, scope) = await this._NewAsync();
		await using var _ = scope;
		var tenantId = await MastodonInstanceLimitsRefreshHandlerSpec._TenantAsync(db);
		var host = $"both-{Guid.NewGuid():N}.example";
		var mastodon = await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, tenantId, host);
		var pixelfed = await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, tenantId, host, SocialProvider.Pixelfed);
		var client = new RecordingClient();
		client.LimitsByHost[host] = new MastodonInstanceLimits(1500, 5, 23, null, null);

		await MastodonInstanceLimitsRefreshHandlerSpec._Handler(db, client)
			.HandleAsync(MastodonInstanceLimitsRefreshHandlerSpec._Context(), CancellationToken.None);

		ProviderCapabilityRegistry.Resolve(await this._ReadAsync(mastodon)).TextLimits.Single().Rule.Unit.Should().Be("characters");
		ProviderCapabilityRegistry.Resolve(await this._ReadAsync(pixelfed)).TextLimits.Single().Rule.Unit.Should().Be("utf16");
	}

	[Fact]
	public async Task ItShouldKeepRefreshingTheOtherServersWhenOneThrowsUnexpectedly() {
		var (db, scope) = await this._NewAsync();
		await using var _ = scope;
		var tenantId = await MastodonInstanceLimitsRefreshHandlerSpec._TenantAsync(db);
		var bad = $"a-bad-{Guid.NewGuid():N}.example";
		var good = $"z-good-{Guid.NewGuid():N}.example";
		await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, tenantId, bad);
		var goodId = await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, tenantId, good);
		var client = new RecordingClient();
		client.ThrowingHosts.Add(bad);
		client.LimitsByHost[good] = new MastodonInstanceLimits(3210, 4, 23, null, null);

		var outcome = await MastodonInstanceLimitsRefreshHandlerSpec._Handler(db, client)
			.HandleAsync(MastodonInstanceLimitsRefreshHandlerSpec._Context(), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.Success>();
		ProviderCapabilityRegistry.Resolve(await this._ReadAsync(goodId)).TextLimits.Single().Max.Should().Be(3210);
	}

	[Fact]
	public async Task ItShouldNotReportSuccessWhenEveryServerFailedUnexpectedly() {
		var (db, scope) = await this._NewAsync();
		await using var _ = scope;
		var tenantId = await MastodonInstanceLimitsRefreshHandlerSpec._TenantAsync(db);
		var client = new RecordingClient();
		// The shared fixture may hold other specs' servers: make every requested host throw.
		client.ThrowEverywhere = true;
		await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, tenantId, $"down-{Guid.NewGuid():N}.example");

		var outcome = await MastodonInstanceLimitsRefreshHandlerSpec._Handler(db, client)
			.HandleAsync(MastodonInstanceLimitsRefreshHandlerSpec._Context(), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.Retry>("a total outage must not look like a success in the staff job view");
	}

	[Fact]
	public async Task ItShouldBeHarmlessToRunTwice() {
		var (db, scope) = await this._NewAsync();
		await using var _ = scope;
		var host = $"twice-{Guid.NewGuid():N}.example";
		var id = await MastodonInstanceLimitsRefreshHandlerSpec._AccountAsync(db, await MastodonInstanceLimitsRefreshHandlerSpec._TenantAsync(db), host);
		var client = new RecordingClient();
		client.LimitsByHost[host] = new MastodonInstanceLimits(4000, 4, 23, null, null);
		var handler = MastodonInstanceLimitsRefreshHandlerSpec._Handler(db, client);

		await handler.HandleAsync(MastodonInstanceLimitsRefreshHandlerSpec._Context(), CancellationToken.None);
		var afterFirst = (await this._ReadAsync(id)).CapabilityOverrides;
		await handler.HandleAsync(MastodonInstanceLimitsRefreshHandlerSpec._Context(), CancellationToken.None);

		var afterSecond = (await this._ReadAsync(id)).CapabilityOverrides;
		afterSecond.Should().Be(afterFirst);
		ProviderCapabilityRegistry.Resolve(await this._ReadAsync(id)).TextLimits.Single().Max.Should().Be(4000);
	}
}
