using FluentAssertions;

using Microsoft.AspNetCore.Http;

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

	private static DefaultHttpContext CreateContext(
		string sessionToken
	) {
		var context = new DefaultHttpContext();
		context.Request.Headers[
			AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY
		] = sessionToken;
		return context;
	}

	private static ApiRateLimitSettings CreateSettings(
		int authenticatedPermitLimit = 100,
		int bulkPermitLimit = 100,
		int tenantBulkPermitLimit = 100
	) {
		var generous = new RateLimitWindowSettings(
			100,
			LongWindowSeconds
		);

		return new ApiRateLimitSettings(
			Global: generous,
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
