using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;

using Xunit;

namespace PublyApp.Api.Lib.RateLimiting;

public sealed class ApiRateLimitPoliciesSpec {
	private const int LongWindowSeconds = 3_600;

	[Fact]
	public void ItShouldHashSessionTokensBeforeUsingThemAsPartitionKeys() {
		var firstContext = CreateContext("raw-session-token");
		var sameContext = CreateContext("raw-session-token");
		var otherContext = CreateContext("other-session-token");

		var first = ApiRateLimitPartitionKeys.GetSessionFingerprint(
			firstContext
		);
		var same = ApiRateLimitPartitionKeys.GetSessionFingerprint(
			sameContext
		);
		var other = ApiRateLimitPartitionKeys.GetSessionFingerprint(
			otherContext
		);

		first.Should().Be(same);
		first.Should().NotBe(other);
		first.Should().NotContain("raw-session-token");
		first.Should().HaveLength(64);
	}

	[Fact]
	public async Task ItShouldKeepAuthenticatedSessionPartitionsIndependent() {
		await using var store = new ApiRateLimiterStore(
			CreateSettings(authenticatedPermitLimit: 1)
		);

		using var firstSession = store.CreateSingle(
			ApiRateLimitPolicies.AuthenticatedDefault,
			"first-session-fingerprint"
		);
		using var secondSession = store.CreateSingle(
			ApiRateLimitPolicies.AuthenticatedDefault,
			"second-session-fingerprint"
		);

		using var firstLease = await firstSession.AcquireAsync();
		using var rejectedLease = await firstSession.AcquireAsync();
		using var independentLease = await secondSession.AcquireAsync();

		firstLease.IsAcquired.Should().BeTrue();
		rejectedLease.IsAcquired.Should().BeFalse();
		independentLease.IsAcquired.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldShareTheTenantBulkLimitAcrossSessions() {
		await using var store = new ApiRateLimiterStore(
			CreateSettings(
				bulkPermitLimit: 10,
				tenantBulkPermitLimit: 2
			)
		);

		using var firstSession = store.CreateTenantChained(
			ApiRateLimitPolicies.BulkOperation,
			"first-session-fingerprint",
			ApiRateLimitPolicies.TenantBulkOperation,
			"tenant-a"
		);
		using var secondSession = store.CreateTenantChained(
			ApiRateLimitPolicies.BulkOperation,
			"second-session-fingerprint",
			ApiRateLimitPolicies.TenantBulkOperation,
			"tenant-a"
		);
		using var thirdSession = store.CreateTenantChained(
			ApiRateLimitPolicies.BulkOperation,
			"third-session-fingerprint",
			ApiRateLimitPolicies.TenantBulkOperation,
			"tenant-a"
		);
		using var otherTenant = store.CreateTenantChained(
			ApiRateLimitPolicies.BulkOperation,
			"fourth-session-fingerprint",
			ApiRateLimitPolicies.TenantBulkOperation,
			"tenant-b"
		);

		using var firstLease = await firstSession.AcquireAsync();
		using var secondLease = await secondSession.AcquireAsync();
		using var rejectedLease = await thirdSession.AcquireAsync();
		using var independentLease = await otherTenant.AcquireAsync();

		firstLease.IsAcquired.Should().BeTrue();
		secondLease.IsAcquired.Should().BeTrue();
		rejectedLease.IsAcquired.Should().BeFalse();
		independentLease.IsAcquired.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldApplyTheGlobalFloorByIpAndExcludeInfrastructurePaths() {
		var settings = CreateSettings(
			globalPermitLimit: 1
		);
		await using var store = new ApiRateLimiterStore(
			settings
		);
		var options = new RateLimiterOptions();
		new ApiRateLimiterOptionsSetup(
			store
		).Configure(options);
		var globalLimiter = options.GlobalLimiter;

		globalLimiter.Should().NotBeNull();
		Assert.NotNull(globalLimiter);

		var firstContext = CreateIpContext(
			"203.0.113.50",
			"/global-only"
		);
		var sameIpContext = CreateIpContext(
			"203.0.113.50",
			"/global-only"
		);
		var otherIpContext = CreateIpContext(
			"203.0.113.51",
			"/global-only"
		);

		using var firstLease = await globalLimiter
			.AcquireAsync(firstContext);
		using var rejectedLease = await globalLimiter
			.AcquireAsync(sameIpContext);
		using var independentLease = await globalLimiter
			.AcquireAsync(otherIpContext);
		using var fileLease = await globalLimiter.AcquireAsync(
			CreateIpContext("203.0.113.50", "/files/logo.png")
		);
		using var healthLease = await globalLimiter.AcquireAsync(
			CreateIpContext("203.0.113.50", "/health/ready")
		);

		firstLease.IsAcquired.Should().BeTrue();
		rejectedLease.IsAcquired.Should().BeFalse();
		independentLease.IsAcquired.Should().BeTrue();
		fileLease.IsAcquired.Should().BeTrue();
		healthLease.IsAcquired.Should().BeTrue();
	}

	[Fact]
	public void ItShouldKeepOnlySafeRejectionLogContext() {
		var context = new DefaultHttpContext();
		const string rawPartition =
			"raw-session-token\nperson@example.com";

		RateLimitRejectionContext.Set(
			context,
			ApiRateLimitPolicies.EmailOperation,
			rawPartition
		);

		var info = RateLimitRejectionContext.Get(context);

		info.Should().NotBeNull();
		Assert.NotNull(info);
		info.PolicyName.Should().Be(
			ApiRateLimitPolicies.EmailOperation
		);
		info.PartitionFingerprint.Should().HaveLength(16);
		info.PartitionFingerprint.Should()
			.NotContain("raw-session-token")
			.And.NotContain("person@example.com");
	}

	private static DefaultHttpContext CreateContext(
		string sessionToken
	) {
		var context = new DefaultHttpContext();
		context.Request.Headers[
			AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY
		] = sessionToken;
		return context;
	}

	private static DefaultHttpContext CreateIpContext(
		string clientIp,
		string path
	) {
		var context = new DefaultHttpContext();
		context.Connection.RemoteIpAddress =
			System.Net.IPAddress.Parse(clientIp);
		context.Request.Path = path;
		return context;
	}

	private static ApiRateLimitSettings CreateSettings(
		int globalPermitLimit = 100,
		int authenticatedPermitLimit = 100,
		int bulkPermitLimit = 100,
		int tenantBulkPermitLimit = 100
	) {
		var generous = new RateLimitWindowSettings(
			100,
			LongWindowSeconds
		);

		return new ApiRateLimitSettings(
			Global: new RateLimitWindowSettings(
				globalPermitLimit,
				LongWindowSeconds
			),
			AnonymousOther: generous,
			Authenticated: new RateLimitWindowSettings(
				authenticatedPermitLimit,
				LongWindowSeconds
			),
			HeavySearch: generous,
			Bulk: new RateLimitWindowSettings(
				bulkPermitLimit,
				LongWindowSeconds
			),
			TenantBulk: new RateLimitWindowSettings(
				tenantBulkPermitLimit,
				LongWindowSeconds
			),
			Email: generous,
			TenantEmail: generous,
			Export: generous,
			TenantExport: generous,
			Upload: generous
		);
	}
}
