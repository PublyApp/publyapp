using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
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

	private sealed class FakeMastodonClient : IMastodonClient {
		public List<string> Calls { get; } = [];

		public MastodonAccountInfo Account { get; set; } = new("109", "alice");

		public MastodonInstanceLimits? Limits { get; set; }

		public string Token { get; set; } = "access-token-1";

		public MastodonResult<string>? TokenResult { get; set; }

		// When set, each registration gets its own client id (to tell two apps apart).
		public bool UniqueClients { get; set; }

		public string? LastExchangeClientId { get; private set; }

		// Whether the fake instance advertises PKCE S256; false models an older Mastodon / Pixelfed.
		public bool SupportsPkce { get; set; }

		public string? LastExchangeVerifier { get; private set; }

		public Task<MastodonResult<MastodonApp>> RegisterAppAsync(string host, string redirectUri, string scopes, CancellationToken cancellationToken) {
			this.Calls.Add($"register {host}");
			var clientId = this.UniqueClients ? $"client-{scopes.Replace(' ', '-')}" : "client-id";
			return Task.FromResult<MastodonResult<MastodonApp>>(new MastodonResult<MastodonApp>.Ok(new MastodonApp(clientId, "client-secret")));
		}

		public Task<bool> SupportsPkceAsync(string host, CancellationToken cancellationToken) {
			this.Calls.Add($"pkce {host}");
			return Task.FromResult(this.SupportsPkce);
		}

		public Task<MastodonResult<string>> ExchangeCodeAsync(string host, MastodonApp app, string redirectUri, string code, string? codeVerifier, CancellationToken cancellationToken) {
			this.Calls.Add($"exchange {host}");
			this.LastExchangeClientId = app.ClientId;
			this.LastExchangeVerifier = codeVerifier;
			return Task.FromResult(this.TokenResult ?? new MastodonResult<string>.Ok(this.Token));
		}

		public Task<MastodonResult<MastodonAccountInfo>> VerifyCredentialsAsync(string host, string accessToken, CancellationToken cancellationToken) {
			this.Calls.Add($"verify {host}");
			return Task.FromResult<MastodonResult<MastodonAccountInfo>>(new MastodonResult<MastodonAccountInfo>.Ok(this.Account));
		}

		public Task<MastodonInstanceLimits?> GetInstanceLimitsAsync(string host, CancellationToken cancellationToken) {
			this.Calls.Add($"limits {host}");
			return Task.FromResult(this.Limits);
		}

		public Exception? RevokeFailure { get; set; }

		public Task RevokeAsync(string host, MastodonApp app, string accessToken, CancellationToken cancellationToken) {
			if (this.RevokeFailure is not null) {
				throw this.RevokeFailure;
			}

			this.Calls.Add($"revoke {host} {accessToken} {app.ClientSecret}");
			return Task.CompletedTask;
		}
	}
}
