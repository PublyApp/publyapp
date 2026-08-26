using System.Threading.RateLimiting;

using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

using Xunit;

namespace PublyApp.Api.Lib.RateLimiting;

public sealed class ApiRateLimitPoliciesSpec {
	private const int LongWindowSeconds = 3_600;

	[Fact]
	public void ItShouldIgnoreUnvalidatedSessionTokenHeaders() {
		var firstContext = CreateContext(
			"forged-session-token",
			"203.0.113.60"
		);
		var otherContext = CreateContext(
			"other-forged-session-token",
			"203.0.113.60"
		);

		var first = ApiRateLimitPartitionKeys.GetSessionFingerprint(
			firstContext
		);
		var other = ApiRateLimitPartitionKeys.GetSessionFingerprint(
			otherContext
		);

		first.Should().Be(other);
		first.Should()
			.StartWith("unauthenticated:");
		first.Should()
			.NotContain("forged-session-token");
	}

	[Fact]
	public async Task ItShouldKeepAuthenticatedSessionPartitionsIndependent() {
		await using var store = new ApiRateLimiterStore(
			CreateSettings(authenticatedPermitLimit: 1),
			new MemoryRateLimitCounterStore()
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
	public async Task ItShouldReplenishAndBecomeEvictableAfterTheWindow() {
		await using var store = new ApiRateLimiterStore(
			CreateSettings(
				authenticatedPermitLimit: 1,
				authenticatedWindowSeconds: 1
			),
			new MemoryRateLimitCounterStore()
		);
		using var limiter = store.CreateSingle(
			ApiRateLimitPolicies.AuthenticatedDefault,
			"eventually-idle-session"
		);

		using var firstLease = await limiter.AcquireAsync();
		using var rejectedLease = await limiter.AcquireAsync();
		await Task.Delay(TimeSpan.FromMilliseconds(1_200));

		limiter.IdleDuration.Should()
			.NotBeNull()
			.And.BeGreaterThan(TimeSpan.Zero);
		using var replenishedLease =
			await limiter.AcquireAsync();

		firstLease.IsAcquired.Should().BeTrue();
		rejectedLease.IsAcquired.Should().BeFalse();
		replenishedLease.IsAcquired.Should().BeTrue();
		limiter.IdleDuration.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldShareTheTenantBulkLimitAcrossSessions() {
		await using var store = new ApiRateLimiterStore(
			CreateSettings(
				bulkPermitLimit: 10,
				tenantBulkPermitLimit: 2
			),
			new MemoryRateLimitCounterStore()
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
			settings,
			new MemoryRateLimitCounterStore()
		);
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

		using var firstLimiter = store.CreateGlobal(
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(firstContext)
		);
		using var sameIpLimiter = store.CreateGlobal(
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(sameIpContext)
		);
		using var otherIpLimiter = store.CreateGlobal(
			AnonymousAuthRateLimitPartitionKeys
				.GetClientIp(otherIpContext)
		);
		using var firstLease = await firstLimiter
			.AcquireAsync();
		using var rejectedLease = await sameIpLimiter
			.AcquireAsync();
		using var independentLease = await otherIpLimiter
			.AcquireAsync();

		firstLease.IsAcquired.Should().BeTrue();
		rejectedLease.IsAcquired.Should().BeFalse();
		independentLease.IsAcquired.Should().BeTrue();
		GlobalRateLimitMiddleware.IsExcluded(
			CreateIpContext(
				"203.0.113.50",
				"/files/logo.png"
			)
		).Should().BeTrue();
		GlobalRateLimitMiddleware.IsExcluded(
			CreateIpContext(
				"203.0.113.50",
				"/health/ready"
			)
		).Should().BeTrue();
		GlobalRateLimitMiddleware.IsExcluded(
			CreateIpContext(
				"203.0.113.50",
				"/health/not-real"
			)
		).Should().BeFalse();
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

	[Fact]
	public async Task
	ItShouldAggregateRepeatedRejectionLogsPerPolicy() {
		var provider = new CapturingLoggerProvider();
		await using var services = new ServiceCollection()
			.AddLogging(builder => builder.AddProvider(provider))
			.AddSingleton<RateLimitRejectionLogAggregator>()
			.BuildServiceProvider();
		using var limiter = new FixedWindowRateLimiter(
			new FixedWindowRateLimiterOptions {
				PermitLimit = 1,
				Window = TimeSpan.FromMinutes(1),
				QueueLimit = 0,
				QueueProcessingOrder =
					QueueProcessingOrder.OldestFirst,
				AutoReplenishment = false,
			}
		);
		using var acquiredLease = limiter.AttemptAcquire();
		using var rejectedLease = limiter.AttemptAcquire();

		for (var requestNumber = 0; requestNumber < 3; requestNumber++) {
			var context = new DefaultHttpContext {
				RequestServices = services,
			};
			context.Response.Body = new MemoryStream();
			RateLimitRejectionContext.Set(
				context,
				ApiRateLimitPolicies.EmailOperation,
				$"partition-{requestNumber}"
			);

			await RateLimitRejectionResponse.WriteAsync(
				context,
				rejectedLease
			);
		}

		provider.WarningCount.Should().Be(1);
	}

	[Fact]
	public void
	ItShouldReportSuppressedRejectionsInTheNextSample() {
		var timeProvider = new ManualTimeProvider();
		var aggregator = new RateLimitRejectionLogAggregator(
			timeProvider
		);
		var info = new RateLimitRejectionInfo(
			ApiRateLimitPolicies.EmailOperation,
			"fingerprint"
		);

		var first = aggregator.Record(info);
		var suppressed = aggregator.Record(info);
		aggregator.Record(info).Should().BeNull();
		timeProvider.Advance(TimeSpan.FromMinutes(1));
		var aggregate = aggregator.Record(info);

		first.Should().NotBeNull();
		Assert.NotNull(first);
		first.RejectionCount.Should().Be(1);
		suppressed.Should().BeNull();
		aggregate.Should().NotBeNull();
		Assert.NotNull(aggregate);
		aggregate.RejectionCount.Should().Be(3);
	}

	private static DefaultHttpContext CreateContext(
		string sessionToken,
		string clientIp
	) {
		var context = new DefaultHttpContext();
		context.Request.Headers[
			AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY
		] = sessionToken;
		context.Connection.RemoteIpAddress =
			System.Net.IPAddress.Parse(clientIp);
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
		int authenticatedWindowSeconds = LongWindowSeconds,
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
				authenticatedWindowSeconds
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
			Upload: generous,
			SocialConnect: generous
		);
	}

	private sealed class CapturingLoggerProvider
		: ILoggerProvider {
		public int WarningCount { get; private set; }

		public ILogger CreateLogger(string categoryName) {
			return new CapturingLogger(this);
		}

		public void Dispose() {
		}

		private sealed class CapturingLogger(
			CapturingLoggerProvider provider
		) : ILogger {
			public IDisposable? BeginScope<TState>(
				TState state
			) where TState : notnull {
				return null;
			}

			public bool IsEnabled(LogLevel logLevel) {
				return true;
			}

			public void Log<TState>(
				LogLevel logLevel,
				EventId eventId,
				TState state,
				Exception? exception,
				Func<TState, Exception?, string>
					formatter
			) {
				if (logLevel == LogLevel.Warning) {
					provider.WarningCount++;
				}
			}
		}
	}

	private sealed class ManualTimeProvider : TimeProvider {
		private long _timestamp;

		public override long TimestampFrequency {
			get {
				return TimeSpan.TicksPerSecond;
			}
		}

		public override long GetTimestamp() {
			return _timestamp;
		}

		public void Advance(TimeSpan duration) {
			_timestamp += duration.Ticks;
		}
	}
}
