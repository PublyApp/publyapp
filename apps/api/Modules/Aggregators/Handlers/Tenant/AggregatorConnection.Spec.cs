using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Aggregators.Fakes;
using PublyApp.Api.Modules.Aggregators.Ports;
using PublyApp.Api.Modules.Aggregators.Services;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.SocialAccounts.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Aggregators.Handlers.Tenant;

// Slice 1 of #2343: the key lifecycle against the in-process fake aggregator, the
// secret-leak sweep (response, row, audit), tenant isolation and permissions.
public sealed class AggregatorConnectionSpec : IClassFixture<ApiFixture> {
	private const string _Url = "/aggregators/zernio/connection";

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public AggregatorConnectionSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldRefuseAnInvalidKeyAndStoreNothingThenAcceptAValidOne() {
		var (tenantId, token) = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var good = $"sk_{Guid.NewGuid():N}{Guid.NewGuid():N}";
		var bad = $"sk_{Guid.NewGuid():N}{Guid.NewGuid():N}";
		this._Fake().ValidKeys.Add(good);

		using var refused = await this._SendAsync(HttpMethod.Put, AggregatorConnectionSpec._Url, tenantId, token, new { apiKey = bad });
		refused.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
		(await refused.Content.ReadAsStringAsync()).Should().NotContain(bad);
		(await this._CountAsync(tenantId)).Should().Be(0);

		using var saved = await this._SendAsync(HttpMethod.Put, AggregatorConnectionSpec._Url, tenantId, token, new { apiKey = good });
		saved.StatusCode.Should().Be(HttpStatusCode.OK);
		var body = await saved.Content.ReadAsStringAsync();
		body.Should().NotContain(good).And.Contain(good[^4..]);

		using var list = await this._SendAsync(HttpMethod.Get, "/aggregators/", tenantId, token);
		var listText = await list.Content.ReadAsStringAsync();
		listText.Should().NotContain(good).And.Contain("\"kind\":\"zernio\"").And.Contain("\"displayName\":\"Zernio\"");
		await this._AssertKeyNowhereAsync(tenantId, good);
	}

	[Fact]
	public async Task ItShouldRecheckFlagAnInvalidKeyAndRemoveIt() {
		var (tenantId, token) = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var key = $"sk_{Guid.NewGuid():N}{Guid.NewGuid():N}";
		this._Fake().ValidKeys.Add(key);
		using var saved = await this._SendAsync(HttpMethod.Put, AggregatorConnectionSpec._Url, tenantId, token, new { apiKey = key });
		saved.StatusCode.Should().Be(HttpStatusCode.OK);

		using var ok = await this._SendAsync(HttpMethod.Post, $"{AggregatorConnectionSpec._Url}/check", tenantId, token);
		(await ok.Content.ReadAsStringAsync()).Should().Contain("\"status\":\"active\"");

		this._Fake().ValidKeys.Clear();
		using var revoked = await this._SendAsync(HttpMethod.Post, $"{AggregatorConnectionSpec._Url}/check", tenantId, token);
		revoked.StatusCode.Should().Be(HttpStatusCode.OK);
		var text = await revoked.Content.ReadAsStringAsync();
		text.Should().Contain("\"status\":\"invalid\"").And.Contain("Zernio refused this key").And.NotContain(key);

		using var removed = await this._SendAsync(HttpMethod.Delete, AggregatorConnectionSpec._Url, tenantId, token);
		removed.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._CountAsync(tenantId)).Should().Be(0);
		using var again = await this._SendAsync(HttpMethod.Delete, AggregatorConnectionSpec._Url, tenantId, token);
		again.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldNotSaveWhenTheAggregatorIsDownAndAnswer503() {
		var (tenantId, token) = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var fake = this._Fake();
		fake.ForcedStatus = HttpStatusCode.ServiceUnavailable;
		try {
			using var response = await this._SendAsync(
				HttpMethod.Put, AggregatorConnectionSpec._Url, tenantId, token, new { apiKey = $"sk_{Guid.NewGuid():N}" }
			);
			response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
			(await this._CountAsync(tenantId)).Should().Be(0);
		} finally {
			fake.ForcedStatus = null;
		}
	}

	[Fact]
	public async Task ItShouldNeverShowAnotherTenantsConnection() {
		var (tenantA, tokenA) = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var (tenantB, tokenB) = await this._LoginAsync(SeedConstants.Tenants.TechStartName, TestConstants.TechStartAdminEmail);
		var key = $"sk_{Guid.NewGuid():N}{Guid.NewGuid():N}";
		this._Fake().ValidKeys.Add(key);
		(await this._SendAsync(HttpMethod.Put, AggregatorConnectionSpec._Url, tenantA, tokenA, new { apiKey = key }))
			.StatusCode.Should().Be(HttpStatusCode.OK);

		using var list = await this._SendAsync(HttpMethod.Get, "/aggregators/", tenantB, tokenB);
		(await list.Content.ReadAsStringAsync()).Should().NotContain(key[^4..]).And.Contain("\"connection\":null");
		(await this._SendAsync(HttpMethod.Post, $"{AggregatorConnectionSpec._Url}/check", tenantB, tokenB))
			.StatusCode.Should().Be(HttpStatusCode.NotFound);
		(await this._SendAsync(HttpMethod.Delete, AggregatorConnectionSpec._Url, tenantB, tokenB))
			.StatusCode.Should().Be(HttpStatusCode.NotFound);
		(await this._CountAsync(tenantA)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldForbidMembersWithoutTheVerbAndRefuseUnknownKinds() {
		var (tenantId, adminToken) = await this._LoginAsync(SeedConstants.Tenants.AcmeName, TestConstants.AcmeAdminEmail);
		var email = await this._CreateBareMemberAsync(tenantId);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);

		foreach (var (method, url) in new[] {
			(HttpMethod.Get, "/aggregators/"),
			(HttpMethod.Put, AggregatorConnectionSpec._Url),
			(HttpMethod.Post, $"{AggregatorConnectionSpec._Url}/check"),
			(HttpMethod.Delete, AggregatorConnectionSpec._Url),
		}) {
			using var response = await this._SendAsync(method, url, tenantId, token, new { apiKey = "sk_12345678" });
			response.StatusCode.Should().Be(HttpStatusCode.Forbidden, $"{method} {url}");
		}

		using var unknown = await this._SendAsync(
			HttpMethod.Put, "/aggregators/nope/connection", tenantId, adminToken, new { apiKey = "sk_12345678" }
		);
		unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
		using var anonymous = await this._Http.GetAsync("/aggregators/");
		anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	private async Task _AssertKeyNowhereAsync(Guid tenantId, string key) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var row = await db.AggregatorConnection.AsNoTracking().SingleAsync(c => c.TenantId == tenantId && !c.IsDeleted);
		row.ProtectedApiKey.Should().NotBeNullOrEmpty().And.NotContain(key);
		row.KeyHint.Should().Be(key[^4..]);
		row.LastError.Should().BeNull();
		var plain = scope.ServiceProvider.GetRequiredService<ICredentialProtector>()
			.Unprotect(row.ProtectedApiKey, AggregatorConnectionService.PurposeFor(AggregatorKind.Zernio));
		plain.Plaintext.Should().Be(key);
		var audits = await db.AuditLog.AsNoTracking().Where(a => a.TargetId == row.Id).ToListAsync();
		audits.Should().NotBeEmpty();
		audits.Should().OnlyContain(a => a.Details == null || !a.Details.Contains(key));
	}

	private async Task<int> _CountAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.AggregatorConnection.AsNoTracking().CountAsync(c => c.TenantId == tenantId && !c.IsDeleted);
	}

	private FakeAggregatorServer _Fake() {
		return this._Fixture.Factory.Services.GetRequiredService<FakeAggregatorServer>();
	}

	private async Task<HttpResponseMessage> _SendAsync(
		HttpMethod method, string url, Guid tenantId, string token, object? payload = null
	) {
		using var request = new HttpRequestMessage(method, url).WithSessionToken(token).WithTenantId(tenantId);
		if (payload is not null) {
			request.Content = JsonContent.Create(payload);
		}

		return await this._Http.SendAsync(request);
	}

	private async Task<(Guid TenantId, string Token)> _LoginAsync(string tenantName, string email) {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(this._Http, staffToken, tenantName);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		// The fixture's database is shared by the specs of this class: start clean.
		using var _ = await this._SendAsync(HttpMethod.Delete, AggregatorConnectionSpec._Url, tenantId, token);
		return (tenantId, token);
	}

	private async Task<string> _CreateBareMemberAsync(Guid tenantId) {
		var email = $"agg-perm-{Guid.NewGuid():N}@example.com";
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			IsVerified = true,
			Status = UserStatus.Active,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId);
		account.ValidateAccountType();
		db.UserAccount.Add(account);
		await db.SaveChangesAsync();
		return email;
	}
}
