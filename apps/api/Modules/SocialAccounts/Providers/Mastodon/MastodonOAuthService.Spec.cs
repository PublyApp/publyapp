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

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

// The Mastodon connect flow against a recording fake instance (no network). Each
// spec method seeds its own tenant, so the shared fixture is safe.
public sealed class MastodonOAuthServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public MastodonOAuthServiceSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private sealed record Harness(
		AppDbContext Db,
		MastodonOAuthService Service,
		FakeMastodonClient Client,
		ICredentialProtector Protector,
		Guid TenantId,
		Guid UserId
	);

	private async Task<(Harness Harness, AsyncServiceScope Scope)> _NewAsync() {
		var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenant = new Tenant {
			Name = $"Mastodon {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		var protector = scope.ServiceProvider.GetRequiredService<ICredentialProtector>();
		var client = new FakeMastodonClient();
		return (
			new Harness(db, new MastodonOAuthService(db, protector, client), client, protector, tenant.GetRequiredId(), Guid.NewGuid()),
			scope
		);
	}

	private static string _StateOf(StartMastodonConnectResult result) {
		var url = result.Should().BeOfType<StartMastodonConnectResult.Started>().Subject.AuthorizeUrl;
		var query = System.Web.HttpUtility.ParseQueryString(new Uri(url).Query);
		return query["state"] ?? string.Empty;
	}

	private static async Task<CompleteMastodonConnectResult.Connected> _ConnectAsync(Harness h, string host, string accountId = "109") {
		h.Client.Account = new MastodonAccountInfo(accountId, "alice");
		var state = MastodonOAuthServiceSpec._StateOf(await h.Service.StartAsync(h.TenantId, h.UserId, host, default));
		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "the-code", state, default);
		return result.Should().BeOfType<CompleteMastodonConnectResult.Connected>().Subject;
	}

	[Theory]
	[InlineData("localhost")]
	[InlineData("10.0.0.1")]
	[InlineData("169.254.169.254")]
	[InlineData("http://mastodon.social")]
	[InlineData("internal.local")]
	public async Task ItShouldRejectUnsafeInstanceHostsWithoutContactingAnything(string host) {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;

		var result = await h.Service.StartAsync(h.TenantId, h.UserId, host, default);

		result.Should().BeOfType<StartMastodonConnectResult.InvalidInstance>();
		h.Client.Calls.Should().BeEmpty();
		(await h.Db.OAuthState.CountAsync(s => s.TenantId == h.TenantId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldRegisterTheAppOncePerHostAndStoreItsSecretEncrypted() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var host = $"once-{Guid.NewGuid():N}.example";

		var first = await h.Service.StartAsync(h.TenantId, h.UserId, host, default);
		var second = await h.Service.StartAsync(h.TenantId, h.UserId, $"https://{host}/", default);

		h.Client.Calls.Count(c => c == $"register {host}").Should().Be(1);
		var registration = await h.Db.OAuthAppRegistration.AsNoTracking().SingleAsync(r => r.Host == host);
		registration.ProtectedClientSecret.Should().NotContain("client-secret").And.NotBeEmpty();
		registration.RedirectUri.Should().EndWith(MastodonOAuthService.CallbackPath);
		var url = new Uri(first.Should().BeOfType<StartMastodonConnectResult.Started>().Subject.AuthorizeUrl);
		url.Host.Should().Be(host);
		url.AbsolutePath.Should().Be("/oauth/authorize");
		var query = System.Web.HttpUtility.ParseQueryString(url.Query);
		query["response_type"].Should().Be("code");
		query["client_id"].Should().Be("client-id");
		query["redirect_uri"].Should().Be(h.Service.RedirectUri);
		query["scope"].Should().Be("read:accounts write:statuses write:media");
		MastodonOAuthServiceSpec._StateOf(second).Should().NotBe(MastodonOAuthServiceSpec._StateOf(first));
	}

	[Fact]
	public async Task ItShouldStoreOnlyAHashOfTheState() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;

		var state = MastodonOAuthServiceSpec._StateOf(await h.Service.StartAsync(h.TenantId, h.UserId, "hash.example", default));

		var row = await h.Db.OAuthState.AsNoTracking().SingleAsync(s => s.TenantId == h.TenantId);
		row.StateHash.Should().NotBe(state).And.HaveLength(64);
		row.UserId.Should().Be(h.UserId);
	}

	[Fact]
	public async Task ItShouldConnectStoreAnEncryptedTokenAndShowAcctAtHost() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;

		var connected = await MastodonOAuthServiceSpec._ConnectAsync(h, "social.example");

		connected.WasKnown.Should().BeFalse();
		var account = connected.Account;
		account.Provider.Should().Be(SocialProvider.Mastodon);
		account.DisplayHandle.Should().Be("alice@social.example");
		account.ExternalAccountId.Should().Be("109@social.example");
		account.CredentialType.Should().Be(SocialCredentialType.OAuth);
		account.Status.Should().Be(SocialAccountStatus.Active);
		account.ProtectedCredentials.Should().NotContain("access-token-1").And.NotContain("social.example");
		var credentials = MastodonCredentials.Unprotect(h.Protector, account.ProtectedCredentials);
		credentials.Should().Be(new MastodonCredentials("social.example", "access-token-1"));
		credentials?.ToString().Should().NotContain("access-token-1");
	}

	[Fact]
	public async Task ItShouldWriteTheInstanceLimitsAsCapabilityOverrides() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.Limits = new MastodonInstanceLimits(5000, 6, 23, 8_000_000, ["image/png"]);

		var connected = await MastodonOAuthServiceSpec._ConnectAsync(h, "big.example");

		connected.Account.CapabilityRefreshedAt.Should().NotBeNull();
		var capability = Publishing.Providers.Capabilities.ProviderCapabilityRegistry.Resolve(connected.Account);
		capability.TextLimits.Single().Max.Should().Be(5000);
		capability.MaxImages.Should().Be(6);
		capability.AcceptedImageContentTypes.Should().Equal("image/png");
	}

	[Fact]
	public async Task ItShouldRejectAReplayedState() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var state = MastodonOAuthServiceSpec._StateOf(await h.Service.StartAsync(h.TenantId, h.UserId, "replay.example", default));

		var first = await h.Service.CompleteAsync(h.TenantId, h.UserId, "c1", state, default);
		var replay = await h.Service.CompleteAsync(h.TenantId, h.UserId, "c2", state, default);

		first.Should().BeOfType<CompleteMastodonConnectResult.Connected>();
		replay.Should().BeOfType<CompleteMastodonConnectResult.InvalidState>();
		h.Client.Calls.Count(c => c.StartsWith("exchange", StringComparison.Ordinal)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRejectAForeignOrUnknownStateWithoutBurningTheRealOne() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var state = MastodonOAuthServiceSpec._StateOf(await h.Service.StartAsync(h.TenantId, h.UserId, "foreign.example", default));

		var otherUser = await h.Service.CompleteAsync(h.TenantId, Guid.NewGuid(), "c", state, default);
		var otherTenant = await h.Service.CompleteAsync(Guid.NewGuid(), h.UserId, "c", state, default);
		var unknown = await h.Service.CompleteAsync(h.TenantId, h.UserId, "c", "not-a-state", default);
		var genuine = await h.Service.CompleteAsync(h.TenantId, h.UserId, "c", state, default);

		otherUser.Should().BeOfType<CompleteMastodonConnectResult.InvalidState>();
		otherTenant.Should().BeOfType<CompleteMastodonConnectResult.InvalidState>();
		unknown.Should().BeOfType<CompleteMastodonConnectResult.InvalidState>();
		genuine.Should().BeOfType<CompleteMastodonConnectResult.Connected>();
	}

	[Fact]
	public async Task ItShouldRejectAnExpiredState() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var state = MastodonOAuthServiceSpec._StateOf(await h.Service.StartAsync(h.TenantId, h.UserId, "expired.example", default));
		await h.Db.OAuthState.Where(s => s.TenantId == h.TenantId)
			.ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAt, DateTime.UtcNow.AddMinutes(-1)));

		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "c", state, default);

		result.Should().BeOfType<CompleteMastodonConnectResult.InvalidState>();
		h.Client.Calls.Should().NotContain(c => c.StartsWith("exchange", StringComparison.Ordinal));
	}

	[Fact]
	public async Task ItShouldStoreNothingWhenTheInstanceRefusesTheCode() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.TokenResult = new MastodonResult<string>.Refused("the instance answered 400");
		var state = MastodonOAuthServiceSpec._StateOf(await h.Service.StartAsync(h.TenantId, h.UserId, "refuse.example", default));

		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "bad", state, default);

		result.Should().BeOfType<CompleteMastodonConnectResult.Refused>();
		(await h.Db.SocialAccount.CountAsync(a => a.TenantId == h.TenantId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldRefreshTheLimitsAndReactivateOnReconnect() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.Limits = new MastodonInstanceLimits(500, 4, 23, null, null);
		var first = await MastodonOAuthServiceSpec._ConnectAsync(h, "again.example");
		first.Account.Status = SocialAccountStatus.NeedsReconnect;
		first.Account.LastError = "token rejected";
		await h.Db.SaveChangesAsync();
		h.Client.Limits = new MastodonInstanceLimits(2000, 4, 23, null, null);
		h.Client.Token = "access-token-2";

		var second = await MastodonOAuthServiceSpec._ConnectAsync(h, "again.example");

		second.WasKnown.Should().BeTrue();
		second.Account.GetRequiredId().Should().Be(first.Account.GetRequiredId());
		second.Account.Status.Should().Be(SocialAccountStatus.Active);
		second.Account.LastError.Should().BeNull();
		Publishing.Providers.Capabilities.ProviderCapabilityRegistry.Resolve(second.Account).TextLimits.Single().Max.Should().Be(2000);
		MastodonCredentials.Unprotect(h.Protector, second.Account.ProtectedCredentials)
			.Should().Be(new MastodonCredentials("again.example", "access-token-2"));
		(await h.Db.SocialAccount.CountAsync(a => a.TenantId == h.TenantId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldKeepTheLastKnownLimitsWhenTheInstanceAdvertisesNothingOnReconnect() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.Limits = new MastodonInstanceLimits(5000, 4, 23, null, null);
		await MastodonOAuthServiceSpec._ConnectAsync(h, "quiet.example");
		h.Client.Limits = null;

		var second = await MastodonOAuthServiceSpec._ConnectAsync(h, "quiet.example");

		Publishing.Providers.Capabilities.ProviderCapabilityRegistry.Resolve(second.Account).TextLimits.Single().Max.Should().Be(5000);
	}

	[Fact]
	public async Task ItShouldConnectPixelfedWithItsOwnScopesPurposeAndCaptionUnit() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var host = $"pix-{Guid.NewGuid():N}.example";
		h.Client.Limits = new MastodonInstanceLimits(1000, 6, null, 8_000_000, ["image/png"]);

		var started = await h.Service.StartAsync(h.TenantId, h.UserId, host, default, SocialProvider.Pixelfed);
		var query = System.Web.HttpUtility.ParseQueryString(
			new Uri(started.Should().BeOfType<StartMastodonConnectResult.Started>().Subject.AuthorizeUrl).Query
		);
		query["scope"].Should().Be("read write");
		(await h.Db.OAuthState.AsNoTracking().SingleAsync(s => s.TenantId == h.TenantId)).Provider.Should().Be(SocialProvider.Pixelfed);

		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "the-code", query["state"] ?? string.Empty, default);

		var account = result.Should().BeOfType<CompleteMastodonConnectResult.Connected>().Subject.Account;
		account.Provider.Should().Be(SocialProvider.Pixelfed);
		var capability = Publishing.Providers.Capabilities.ProviderCapabilityRegistry.Resolve(account);
		capability.TextLimits.Single().Rule.Unit.Should().Be("utf16");
		capability.TextLimits.Single().Max.Should().Be(1000);
		capability.MaxImages.Should().Be(6);
		MastodonCredentials.Unprotect(h.Protector, account.ProtectedCredentials, SocialProvider.Pixelfed)
			.Should().Be(new MastodonCredentials(host, "access-token-1"));
		MastodonCredentials.Unprotect(h.Protector, account.ProtectedCredentials).Should().BeNull();
		var session = await new MastodonSessionProvider(h.Db, h.Protector).OpenSessionAsync(account.GetRequiredId(), default);
		session.Should().BeOfType<SocialSessionResult.Opened>().Which.Session.AccessJwt.Should().Be("access-token-1");
		(await h.Service.PrepareRevocationAsync(h.TenantId, account.GetRequiredId(), default)).Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldKeepSeparateAppRegistrationsForMastodonAndPixelfedOnTheSameHost() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.UniqueClients = true;
		var host = $"both-{Guid.NewGuid():N}.example";

		var mastodon = await h.Service.StartAsync(h.TenantId, h.UserId, host, default);
		await h.Service.StartAsync(h.TenantId, h.UserId, host, default, SocialProvider.Pixelfed);
		var again = await h.Service.StartAsync(h.TenantId, h.UserId, host, default);
		var result = await h.Service.CompleteAsync(
			h.TenantId, h.UserId, "the-code", MastodonOAuthServiceSpec._StateOf(mastodon), default
		);

		result.Should().BeOfType<CompleteMastodonConnectResult.Connected>();
		again.Should().BeOfType<StartMastodonConnectResult.Started>();
		h.Client.Calls.Count(c => c == $"register {host}").Should().Be(2, "one registration per network, no churn");
		var rows = await h.Db.OAuthAppRegistration.AsNoTracking().Where(r => r.Host == host).ToListAsync();
		rows.Select(r => (r.Provider, r.Scopes)).Should().BeEquivalentTo([
			(SocialProvider.Mastodon, MastodonOAuthService.Scopes),
			(SocialProvider.Pixelfed, MastodonOAuthService.PixelfedScopes),
		]);
		h.Client.LastExchangeClientId.Should().Be("client-read:accounts-write:statuses-write:media");
	}

	[Fact]
	public async Task ItShouldSendAPkceChallengeAndKeepTheVerifierEncryptedWhenTheInstanceAdvertisesS256() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.SupportsPkce = true;

		var started = await h.Service.StartAsync(h.TenantId, h.UserId, "pkce.example", default);

		var query = System.Web.HttpUtility.ParseQueryString(
			new Uri(started.Should().BeOfType<StartMastodonConnectResult.Started>().Subject.AuthorizeUrl).Query
		);
		query["code_challenge_method"].Should().Be("S256");
		query["code_challenge"].Should().HaveLength(43, "the base64url of a SHA-256");
		var row = await h.Db.OAuthState.AsNoTracking().SingleAsync(s => s.TenantId == h.TenantId);
		row.ProtectedCodeVerifier.Should().NotBeNullOrEmpty();

		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "the-code", query["state"] ?? string.Empty, default);

		result.Should().BeOfType<CompleteMastodonConnectResult.Connected>();
		var verifier = h.Client.LastExchangeVerifier.Should().NotBeNull().And.Subject;
		row.ProtectedCodeVerifier.Should().NotContain(verifier, "only the encrypted verifier is stored");
		var expected = Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(verifier)))
			.TrimEnd('=').Replace('+', '-').Replace('/', '_');
		query["code_challenge"].Should().Be(expected, "the challenge is S256(verifier) per RFC 7636");
	}

	[Fact]
	public async Task ItShouldConnectWithoutPkceWhenTheInstanceDoesNotAdvertiseIt() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.SupportsPkce = false;

		var started = await h.Service.StartAsync(h.TenantId, h.UserId, "nopkce.example", default);

		var query = System.Web.HttpUtility.ParseQueryString(
			new Uri(started.Should().BeOfType<StartMastodonConnectResult.Started>().Subject.AuthorizeUrl).Query
		);
		query["code_challenge"].Should().BeNull();
		query["code_challenge_method"].Should().BeNull();
		(await h.Db.OAuthState.AsNoTracking().SingleAsync(s => s.TenantId == h.TenantId)).ProtectedCodeVerifier.Should().BeNull();

		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "the-code", query["state"] ?? string.Empty, default);

		result.Should().BeOfType<CompleteMastodonConnectResult.Connected>();
		h.Client.LastExchangeVerifier.Should().BeNull("the confidential client alone authenticates the exchange");
	}

	[Fact]
	public async Task ItShouldRefuseAPkceFlowWhoseVerifierCannotBeRead() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.SupportsPkce = true;
		var state = MastodonOAuthServiceSpec._StateOf(await h.Service.StartAsync(h.TenantId, h.UserId, "lostverifier.example", default));
		await h.Db.OAuthState.Where(s => s.TenantId == h.TenantId)
			.ExecuteUpdateAsync(s => s.SetProperty(x => x.ProtectedCodeVerifier, "garbage"));

		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "the-code", state, default);

		result.Should().BeOfType<CompleteMastodonConnectResult.InvalidState>();
		h.Client.Calls.Should().NotContain(c => c.StartsWith("exchange", StringComparison.Ordinal));
	}

	[Fact]
	public async Task ItShouldRefuseANewHostRegistrationBeyondTheTenantQuotaButKeepKnownHostsWorking() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var hosts = Enumerable.Range(0, MastodonOAuthService.MaxNewHostRegistrationsPerTenant)
			.Select(_ => $"quota-{Guid.NewGuid():N}.example")
			.ToList();
		foreach (var host in hosts) {
			(await h.Service.StartAsync(h.TenantId, h.UserId, host, default)).Should().BeOfType<StartMastodonConnectResult.Started>();
		}

		var refused = await h.Service.StartAsync(h.TenantId, h.UserId, $"one-too-many-{Guid.NewGuid():N}.example", default);
		var known = await h.Service.StartAsync(h.TenantId, h.UserId, hosts[0], default);

		refused.Should().BeOfType<StartMastodonConnectResult.QuotaExceeded>();
		h.Client.Calls.Count(c => c.StartsWith("register", StringComparison.Ordinal))
			.Should().Be(MastodonOAuthService.MaxNewHostRegistrationsPerTenant, "the refused host was never contacted");
		known.Should().BeOfType<StartMastodonConnectResult.Started>("a host already registered costs nothing");
	}

	// #2186 review M2: a count-then-register check is not a cap. Many concurrent starts of one
	// tenant (separate scopes, as separate sessions would be) must still register at most
	// the quota, and a refused host must never be contacted.
	[Fact]
	public async Task ItShouldNeverRegisterMoreThanTheQuotaWhenStartsRaceEachOther() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.RegisterDelay = TimeSpan.FromMilliseconds(300);
		var marker = $"race-{Guid.NewGuid():N}";
		var attempts = MastodonOAuthService.MaxNewHostRegistrationsPerTenant * 3;

		var results = await Task.WhenAll(Enumerable.Range(0, attempts).Select(async index => {
			await using var racer = this._Fixture.Factory.Services.CreateAsyncScope();
			var db = racer.ServiceProvider.GetRequiredService<AppDbContext>();
			var protector = racer.ServiceProvider.GetRequiredService<ICredentialProtector>();
			var service = new MastodonOAuthService(db, protector, h.Client);
			return await service.StartAsync(h.TenantId, h.UserId, $"{marker}-{index}.example", default);
		}));

		results.Count(r => r is StartMastodonConnectResult.Started)
			.Should().Be(MastodonOAuthService.MaxNewHostRegistrationsPerTenant);
		results.Count(r => r is StartMastodonConnectResult.QuotaExceeded)
			.Should().Be(attempts - MastodonOAuthService.MaxNewHostRegistrationsPerTenant);
		h.Client.Calls.Count(c => c.StartsWith($"register {marker}", StringComparison.Ordinal))
			.Should().Be(MastodonOAuthService.MaxNewHostRegistrationsPerTenant);
		(await h.Db.OAuthAppRegistration.AsNoTracking().CountAsync(r => r.Host.StartsWith(marker)))
			.Should().Be(MastodonOAuthService.MaxNewHostRegistrationsPerTenant, "no reservation is left behind");
	}

	// #2186 round-2 N1: the per-tenant lock and the DB connection must be released before the
	// slow outbound registration, not held for its whole duration.
	[Fact]
	public async Task ItShouldNotHoldTheLockOrBlockOthersWhileASlowRegistrationIsInFlight() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var slow = $"slow-{Guid.NewGuid():N}.example";
		var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
		var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
		h.Client.OnRegister = async (host, _) => {
			if (host == slow) {
				entered.SetResult();
				await release.Task;
			}
		};

		var first = Task.Run(async () => {
			await using var racer = this._Fixture.Factory.Services.CreateAsyncScope();
			var db = racer.ServiceProvider.GetRequiredService<AppDbContext>();
			var service = new MastodonOAuthService(db, racer.ServiceProvider.GetRequiredService<ICredentialProtector>(), h.Client);
			return await service.StartAsync(h.TenantId, h.UserId, slow, default);
		});
		await entered.Task.WaitAsync(TimeSpan.FromSeconds(20));

		// 1. the tenant lock is free: a second start for another host completes meanwhile.
		await using var second = this._Fixture.Factory.Services.CreateAsyncScope();
		var secondService = new MastodonOAuthService(
			second.ServiceProvider.GetRequiredService<AppDbContext>(),
			second.ServiceProvider.GetRequiredService<ICredentialProtector>(),
			h.Client
		);
		var other = await secondService
			.StartAsync(h.TenantId, h.UserId, $"fast-{Guid.NewGuid():N}.example", default)
			.WaitAsync(TimeSpan.FromSeconds(10));
		other.Should().BeOfType<StartMastodonConnectResult.Started>();

		// 2. the advisory lock itself is not held by the in-flight start.
		await using var probe = this._Fixture.Factory.Services.CreateAsyncScope();
		var probeDb = probe.ServiceProvider.GetRequiredService<AppDbContext>();
		await using var tx = await probeDb.Database.BeginTransactionAsync();
		var free = await probeDb.Database
			.SqlQuery<bool>($"SELECT pg_try_advisory_xact_lock(hashtextextended({h.TenantId.ToString()}, 0)) AS \"Value\"")
			.SingleAsync();
		free.Should().BeTrue("the lock is only held while counting and reserving");

		// 3. the slow start still finishes once the instance answers.
		release.SetResult();
		(await first.WaitAsync(TimeSpan.FromSeconds(20))).Should().BeOfType<StartMastodonConnectResult.Started>();
	}

	[Fact]
	public async Task ItShouldLeaveNoReservationBehindWhenTheRegistrationIsCancelledOrRefused() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var marker = $"gone-{Guid.NewGuid():N}";
		using var cts = new CancellationTokenSource();
		h.Client.OnRegister = async (host, token) => {
			if (host.StartsWith(marker + "-cancel", StringComparison.Ordinal)) {
				await cts.CancelAsync();
				await Task.Delay(Timeout.Infinite, token);
			}
		};

		var act = async () => await h.Service.StartAsync(h.TenantId, h.UserId, $"{marker}-cancel.example", cts.Token);
		await act.Should().ThrowAsync<OperationCanceledException>();

		h.Client.OnRegister = null;
		h.Client.RegisterResult = new MastodonResult<MastodonApp>.Refused("the instance answered 422");
		(await h.Service.StartAsync(h.TenantId, h.UserId, $"{marker}-refused.example", default))
			.Should().BeOfType<StartMastodonConnectResult.Refused>();

		(await h.Db.OAuthAppRegistration.AsNoTracking().CountAsync(r => r.Host.StartsWith(marker)))
			.Should().Be(0, "a cancelled or refused registration frees its slot");
	}

	[Fact]
	public async Task ItShouldCountAnInFlightReservationAgainstTheQuota() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var marker = $"hold-{Guid.NewGuid():N}";
		var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
		var inFlight = 0;
		var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
		h.Client.OnRegister = async (host, _) => {
			if (host.StartsWith(marker, StringComparison.Ordinal)) {
				if (Interlocked.Increment(ref inFlight) == MastodonOAuthService.MaxNewHostRegistrationsPerTenant) {
					entered.SetResult();
				}

				await release.Task;
			}
		};

		var held = Enumerable.Range(0, MastodonOAuthService.MaxNewHostRegistrationsPerTenant).Select(index => Task.Run(async () => {
			await using var racer = this._Fixture.Factory.Services.CreateAsyncScope();
			var db = racer.ServiceProvider.GetRequiredService<AppDbContext>();
			var service = new MastodonOAuthService(db, racer.ServiceProvider.GetRequiredService<ICredentialProtector>(), h.Client);
			return await service.StartAsync(h.TenantId, h.UserId, $"{marker}-{index}.example", default);
		})).ToList();
		await entered.Task.WaitAsync(TimeSpan.FromSeconds(30));

		var extra = await h.Service.StartAsync(h.TenantId, h.UserId, $"over-{Guid.NewGuid():N}.example", default);
		extra.Should().BeOfType<StartMastodonConnectResult.QuotaExceeded>("slots in flight already count");

		release.SetResult();
		await Task.WhenAll(held);
	}

	[Fact]
	public async Task ItShouldNotLetAnotherTenantReuseAFreshPlaceholderButReclaimAStaleOne() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var fresh = $"fresh-{Guid.NewGuid():N}.example";
		var stale = $"stale-{Guid.NewGuid():N}.example";
		foreach (var (host, age) in new[] { (fresh, TimeSpan.FromSeconds(5)), (stale, TimeSpan.FromHours(1)) }) {
			h.Db.OAuthAppRegistration.Add(new OAuthAppRegistration {
				Host = host,
				ClientId = string.Empty,
				ProtectedClientSecret = string.Empty,
				Scopes = "read",
				RedirectUri = "https://x/cb",
				RegisteredByTenantId = Guid.NewGuid(),
				RegisteredAt = DateTime.UtcNow - age,
			});
		}

		await h.Db.SaveChangesAsync();

		(await h.Service.StartAsync(h.TenantId, h.UserId, fresh, default))
			.Should().BeOfType<StartMastodonConnectResult.Unreachable>("another start is registering this host right now");
		(await h.Service.StartAsync(h.TenantId, h.UserId, stale, default))
			.Should().BeOfType<StartMastodonConnectResult.Started>("a reservation nobody finalised is reclaimed");
	}

	[Fact]
	public async Task ItShouldGiveTheQuotaSlotBackWhenTheInstanceRefusesTheRegistration() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.RegisterResult = new MastodonResult<MastodonApp>.Refused("the instance answered 422");
		for (var i = 0; i < MastodonOAuthService.MaxNewHostRegistrationsPerTenant + 2; i++) {
			(await h.Service.StartAsync(h.TenantId, h.UserId, $"refused-{i}-{Guid.NewGuid():N}.example", default))
				.Should().BeOfType<StartMastodonConnectResult.Refused>("a failed registration costs no quota");
		}

		h.Client.RegisterResult = null;
		(await h.Service.StartAsync(h.TenantId, h.UserId, $"fine-{Guid.NewGuid():N}.example", default))
			.Should().BeOfType<StartMastodonConnectResult.Started>();
	}

	[Fact]
	public async Task ItShouldClearThePkceVerifierOnceTheStateIsConsumed() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		h.Client.SupportsPkce = true;
		var state = MastodonOAuthServiceSpec._StateOf(await h.Service.StartAsync(h.TenantId, h.UserId, "clear.example", default));
		(await h.Db.OAuthState.AsNoTracking().SingleAsync(s => s.TenantId == h.TenantId)).ProtectedCodeVerifier.Should().NotBeNull();

		await h.Service.CompleteAsync(h.TenantId, h.UserId, "the-code", state, default);

		(await h.Db.OAuthState.AsNoTracking().SingleAsync(s => s.TenantId == h.TenantId)).ProtectedCodeVerifier
			.Should().BeNull("a consumed state keeps no secret");
	}

	[Fact]
	public async Task ItShouldNotStartAReconnectAgainstAnotherHostThanTheAccountLivesOn() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var own = await MastodonOAuthServiceSpec._ConnectAsync(h, "home-host.example", "6");
		var callsBefore = h.Client.Calls.Count;

		var result = await h.Service.StartAsync(
			h.TenantId, h.UserId, "elsewhere-host.example", default, SocialProvider.Mastodon, own.Account.GetRequiredId()
		);

		result.Should().BeOfType<StartMastodonConnectResult.ReconnectTargetNotFound>();
		h.Client.Calls.Count.Should().Be(callsBefore, "no registration or request on the wrong server");
	}

	[Fact]
	public async Task ItShouldCountTheQuotaPerTenantAndSlideTheWindow() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var (other, otherScope) = await this._NewAsync();
		await using var __ = otherScope;
		for (var i = 0; i < MastodonOAuthService.MaxNewHostRegistrationsPerTenant; i++) {
			await h.Service.StartAsync(h.TenantId, h.UserId, $"slide-{Guid.NewGuid():N}.example", default);
		}

		var blocked = await h.Service.StartAsync(h.TenantId, h.UserId, $"blocked-{Guid.NewGuid():N}.example", default);
		var otherTenant = await other.Service.StartAsync(other.TenantId, other.UserId, $"other-{Guid.NewGuid():N}.example", default);
		await h.Db.OAuthAppRegistration
			.Where(r => r.RegisteredByTenantId == h.TenantId)
			.ExecuteUpdateAsync(r => r.SetProperty(x => x.RegisteredAt, DateTime.UtcNow - MastodonOAuthService.NewHostRegistrationWindow - TimeSpan.FromMinutes(1)));
		var later = await h.Service.StartAsync(h.TenantId, h.UserId, $"later-{Guid.NewGuid():N}.example", default);

		blocked.Should().BeOfType<StartMastodonConnectResult.QuotaExceeded>();
		otherTenant.Should().BeOfType<StartMastodonConnectResult.Started>("the quota is per tenant");
		later.Should().BeOfType<StartMastodonConnectResult.Started>("registrations older than the window no longer count");
	}

	[Fact]
	public async Task ItShouldRefuseAReconnectThatComesBackAsADifferentAccountAndLeaveBothUntouched() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var original = await MastodonOAuthServiceSpec._ConnectAsync(h, "swap.example", "109");
		original.Account.Status = SocialAccountStatus.NeedsReconnect;
		original.Account.LastError = "token rejected";
		await h.Db.SaveChangesAsync();
		var originalCredentials = original.Account.ProtectedCredentials;
		h.Client.Account = new MastodonAccountInfo("777", "bob");
		h.Client.Token = "access-token-bob";

		var started = await h.Service.StartAsync(
			h.TenantId, h.UserId, "swap.example", default, SocialProvider.Mastodon, original.Account.GetRequiredId()
		);
		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "the-code", MastodonOAuthServiceSpec._StateOf(started), default);

		var mismatch = result.Should().BeOfType<CompleteMastodonConnectResult.AccountMismatch>().Subject;
		mismatch.ExpectedHandle.Should().Be("alice@swap.example");
		mismatch.ActualHandle.Should().Be("bob@swap.example");
		mismatch.Host.Should().Be("swap.example");
		mismatch.Provider.Should().Be(SocialProvider.Mastodon);
		(await h.Db.SocialAccount.CountAsync(a => a.TenantId == h.TenantId)).Should().Be(1, "the other account is not linked");
		var stored = await h.Db.SocialAccount.AsNoTracking().SingleAsync(a => a.TenantId == h.TenantId);
		stored.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
		stored.ProtectedCredentials.Should().Be(originalCredentials);
		h.Client.Calls.Should().Contain(c => c.StartsWith("revoke swap.example access-token-bob", StringComparison.Ordinal),
			"the token of the account that was not meant to connect is revoked, not left behind");
	}

	[Fact]
	public async Task ItShouldReconnectNormallyWhenTheSameAccountComesBack() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var original = await MastodonOAuthServiceSpec._ConnectAsync(h, "same.example", "109");
		original.Account.Status = SocialAccountStatus.NeedsReconnect;
		await h.Db.SaveChangesAsync();
		h.Client.Token = "access-token-2";

		var started = await h.Service.StartAsync(
			h.TenantId, h.UserId, "same.example", default, SocialProvider.Mastodon, original.Account.GetRequiredId()
		);
		var result = await h.Service.CompleteAsync(h.TenantId, h.UserId, "the-code", MastodonOAuthServiceSpec._StateOf(started), default);

		var connected = result.Should().BeOfType<CompleteMastodonConnectResult.Connected>().Subject;
		connected.WasKnown.Should().BeTrue();
		connected.Account.Status.Should().Be(SocialAccountStatus.Active);
		h.Client.Calls.Should().NotContain(c => c.StartsWith("revoke", StringComparison.Ordinal));
	}

	[Fact]
	public async Task ItShouldNotStartAReconnectForAnAccountOutsideTheTenantOrNetwork() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var (other, otherScope) = await this._NewAsync();
		await using var __ = otherScope;
		var foreign = await MastodonOAuthServiceSpec._ConnectAsync(other, "foreign-acct.example", "5");
		var own = await MastodonOAuthServiceSpec._ConnectAsync(h, "own-acct.example", "6");

		var unknown = await h.Service.StartAsync(h.TenantId, h.UserId, "own-acct.example", default, SocialProvider.Mastodon, Guid.NewGuid());
		var otherTenants = await h.Service.StartAsync(h.TenantId, h.UserId, "own-acct.example", default, SocialProvider.Mastodon, foreign.Account.GetRequiredId());
		var wrongNetwork = await h.Service.StartAsync(h.TenantId, h.UserId, "own-acct.example", default, SocialProvider.Pixelfed, own.Account.GetRequiredId());

		unknown.Should().BeOfType<StartMastodonConnectResult.ReconnectTargetNotFound>();
		otherTenants.Should().BeOfType<StartMastodonConnectResult.ReconnectTargetNotFound>();
		wrongNetwork.Should().BeOfType<StartMastodonConnectResult.ReconnectTargetNotFound>();
	}

	[Fact]
	public async Task ItShouldRevokeTheTokenBestEffortWithTheStoredAppSecret() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var connected = await MastodonOAuthServiceSpec._ConnectAsync(h, "revoke.example");

		var revocation = await h.Service.PrepareRevocationAsync(h.TenantId, connected.Account.GetRequiredId(), default);
		// The local disconnect erases the credentials FIRST; the prepared revoke still works.
		connected.Account.ProtectedCredentials = string.Empty;
		await h.Db.SaveChangesAsync();
		await h.Service.RevokeBestEffortAsync(revocation, default);

		h.Client.Calls.Should().Contain("revoke revoke.example access-token-1 client-secret");
		(await h.Service.PrepareRevocationAsync(h.TenantId, connected.Account.GetRequiredId(), default)).Should().BeNull();
	}

	[Fact]
	public async Task ItShouldNeverFailADisconnectBecauseTheInstanceIsDown() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var connected = await MastodonOAuthServiceSpec._ConnectAsync(h, "down.example");
		var revocation = await h.Service.PrepareRevocationAsync(h.TenantId, connected.Account.GetRequiredId(), default);
		h.Client.RevokeFailure = new HttpRequestException("down");

		var act = () => h.Service.RevokeBestEffortAsync(revocation, default);

		await act.Should().NotThrowAsync();
	}

	[Fact]
	public async Task ItShouldOpenASessionCarryingTheTokenHostAndHandle() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var connected = await MastodonOAuthServiceSpec._ConnectAsync(h, "session.example");
		var provider = new MastodonSessionProvider(h.Db, h.Protector);

		var result = await provider.OpenSessionAsync(connected.Account.GetRequiredId(), default);

		var session = result.Should().BeOfType<SocialSessionResult.Opened>().Subject.Session;
		session.PdsHost.Should().Be("https://session.example");
		session.AccessJwt.Should().Be("access-token-1");
		session.Handle.Should().Be("alice@session.example");
		session.ToString().Should().NotContain("access-token-1");
	}

	[Fact]
	public async Task ItShouldTreatAnUnreadableCredentialAsAnAccountProblem() {
		var (h, scope) = await this._NewAsync();
		await using var _ = scope;
		var connected = await MastodonOAuthServiceSpec._ConnectAsync(h, "broken.example");
		connected.Account.ProtectedCredentials = "garbage";
		await h.Db.SaveChangesAsync();

		var result = await new MastodonSessionProvider(h.Db, h.Protector)
			.OpenSessionAsync(connected.Account.GetRequiredId(), default);

		result.Should().BeOfType<SocialSessionResult.AccountFailure>();
	}
}
