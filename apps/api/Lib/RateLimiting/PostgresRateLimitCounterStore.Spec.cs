using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.RateLimiting;

// Pins the #953 distributed counter store: one fleet-wide fixed-window budget
// per (policy, hashed partition, window) shared by independent store instances
// borrowing connections from scoped AppDbContexts, atomic over-admission-proof
// accounting, PII-free hashed partitions, and the outage contract (breaker +
// fail CLOSED for anonymous-auth/email policies, fail OPEN elsewhere).
public sealed class PostgresRateLimitCounterStoreSpec
	: IClassFixture<ApiFixture> {
	private static readonly DateTimeOffset BaseTime =
		new(2026, 8, 26, 12, 0, 0, TimeSpan.Zero);

	private readonly ApiFixture _fixture;

	public PostgresRateLimitCounterStoreSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public void ItShouldAlignWindowsToWholeWindowMultiplesAcrossReplicas() {
		var window = TimeSpan.FromSeconds(60);

		PostgresRateLimitCounterStore
			.GetWindowStart(BaseTime, window)
			.Should().Be(BaseTime);
		PostgresRateLimitCounterStore
			.GetWindowStart(
				BaseTime.AddSeconds(59.9),
				window
			)
			.Should().Be(BaseTime);
		PostgresRateLimitCounterStore
			.GetWindowStart(
				BaseTime.AddSeconds(60),
				window
			)
			.Should().Be(BaseTime.AddSeconds(60));
		PostgresRateLimitCounterStore
			.GetWindowStart(
				BaseTime.AddDays(3).AddSeconds(-1),
				window
			)
			.Should().Be(BaseTime.AddDays(3).AddMinutes(-1));
	}

	[Fact]
	public void ItShouldHashPartitionKeysDeterministicallyWithoutRawValues() {
		var first = PostgresRateLimitCounterStore
			.HashPartitionKey("attacker@example.com");
		var second = PostgresRateLimitCounterStore
			.HashPartitionKey("attacker@example.com");
		var other = PostgresRateLimitCounterStore
			.HashPartitionKey("victim@example.com");

		first.Should().Be(second);
		first.Should().NotBe(other);
		first.Should().HaveLength(32);
		first.Should()
			.Match("*", "hex characters only")
			.And.NotContain("@");
		first.Should().NotContain("example.com");
		foreach (var character in first) {
			char.IsAsciiHexDigit(character)
				.Should()
				.BeTrue();
		}
	}

	[Fact]
	public async Task ItShouldShareOneBudgetAcrossTwoStoresOnTheSameDatabase() {
		await using var scope = _fixture.Factory.Services
			.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await dbContext.ClearCounterRowsAsync();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var policyName = $"spec-share-{suffix}";
		const string partitionKey = "two-host-shared-key";
		const int permitLimit = 3;

		var firstStore = CreateStoreFromHost();
		var secondStore = CreateStoreFromHost();

		var firstLease = await firstStore.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var secondLease = await secondStore.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var thirdLease = await secondStore.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var fourthLease = await firstStore.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);

		firstLease.Acquired.Should().BeTrue();
		firstLease.NewPermitCount.Should().Be(1);
		secondLease.Acquired.Should().BeTrue(
			"replica two draws from the very same counter row"
		);
		secondLease.NewPermitCount.Should().Be(2);
		thirdLease.Acquired.Should().BeTrue();
		thirdLease.NewPermitCount.Should().Be(
			permitLimit,
			"the shared row counts every replica's draws"
		);
		fourthLease.Acquired.Should().BeFalse(
			"once the fleet-wide budget is spent no replica may over-admit"
		);
	}
	// #1546 red proof: window_started_at must come from the DB clock
	// (floor(EXTRACT(EPOCH FROM now()) / $4) * $4), not the app clock. Two
	// replicas whose utcNow values are a full window apart would, under the
	// old app-clock code, compute different window_started_at values and
	// silently split one budget into two. With the fix the DB's single clock
	// aligns them to the same window row, so the fleet still enforces exactly
	// permitLimit total.
	[Fact]
	public async Task ItShouldNotSplitBudgetWhenAppClocksAreDesynced() {
		await using var scope = _fixture.Factory.Services
			.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await dbContext.ClearCounterRowsAsync();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var policyName = $"spec-ntp-drift-{suffix}";
		const string partitionKey = "desynced-replica-key";
		const int permitLimit = 3;
		var window = TimeSpan.FromSeconds(60);

		var firstStore = CreateStoreFromHost();
		var secondStore = CreateStoreFromHost();

		// Replica 1's app clock says 12:00:30; replica 2's says 12:01:31
		// (61 s apart — a full window boundary in between under the old code).
		var replicaOneUtcNow = BaseTime.AddSeconds(30);
		var replicaTwoUtcNow = BaseTime.AddSeconds(91);

		// Three acquires at the limit from replica one (drains its view of the
		// budget in the window that starts at ~12:00:00).
		var first = await firstStore.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			window,
			1,
			replicaOneUtcNow
		);
		var second = await firstStore.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			window,
			1,
			replicaOneUtcNow
		);
		var third = await firstStore.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			window,
			1,
			replicaOneUtcNow
		);
		// Replica two (app clock 61 s ahead) tries to draw once more. Under the
		// old code its utcNow maps to a *different* window_started_at, so it
		// would get its own fresh budget and be granted — silently doubling the
		// fleet-wide limit to 4. With the DB-clock fix both replicas land in the
		// same window row and the limit holds at 3.
		var fourth = await secondStore.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			window,
			1,
			replicaTwoUtcNow
		);

		first.Acquired.Should().BeTrue();
		second.Acquired.Should().BeTrue();
		third.Acquired.Should().BeTrue();
		third.NewPermitCount.Should().Be(permitLimit);
		fourth.Acquired.Should().BeFalse(
			"the DB-clock window must not split the budget across desynced replicas"
		);
		fourth.NewPermitCount.Should().BeNull();

		// Belt-and-braces: exactly one row exists for this partition,
		// regardless of how many windows the app clocks thought they were in.
		var rowCount = await dbContext.Database
			.SqlQuery<int>(
				$"""
					SELECT COUNT(*)
					FROM rate_limit_counters
					WHERE policy_name = {policyName}
					"""
			)
			.ToListAsync();
		rowCount.Single().Should().Be(1);
	}

	// #1545: the whole point of a *distributed* counter is atomic concurrency
	// safety. Launch N >= 2 * limit contenders in parallel against one shared
	// counter row; exactly `permitLimit` must succeed — no more, no less. A
	// non-atomic SELECT-then-UPDATE store would let all N through.
	[Fact]
	public async Task ItShouldGrantExactlyPermitLimitUnderConcurrency() {
		await using var scope = _fixture.Factory.Services
			.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await dbContext.ClearCounterRowsAsync();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var policyName = $"spec-concurrency-{suffix}";
		const string partitionKey = "concurrent-contender-key";
		const int permitLimit = 10;
		var window = TimeSpan.FromSeconds(3_600);
		var contenderCount = permitLimit * 2;

		await using var store = CreateStoreFromHost();

		var leases = await Task.WhenAll(
			Enumerable
				.Range(0, contenderCount)
				.Select(_ => store.AcquireAsync(
					policyName,
					partitionKey,
					permitLimit,
					window,
					1,
					BaseTime
				))
		);

		var acquired = leases.Count(l => l.Acquired);
		acquired.Should().Be(
			permitLimit,
			"exactly the fleet-wide limit must succeed under concurrency"
		);
		// Each successful acquire reports the cumulative permit count;
		// under correct atomic accounting those must be exactly 1..limit
		// (order is non-deterministic under real concurrency).
		leases
			.Where(l => l.Acquired)
			.Select(l => l.NewPermitCount)
			.Should()
			.BeEquivalentTo(
				Enumerable.Range(1, permitLimit)
			);
	}

	// #1547: the matrix cell where the circuit breaker is OPEN and the policy
	// is fail-CLOSED was not covered by any existing test. While the breaker
	// is open the store never dials Postgres, so a fail-CLOSED policy must
	// still reject — that is the entire point of failing closed during an
	// outage.
	[Fact]
	public async Task ItShouldFailClosedForAbusePoliciesWhileTheBreakerIsOpen() {
		var timeProvider = new ManualTimeProvider {
			UtcNowValue = BaseTime,
		};
		var throwingFactory = new ThrowingScopeFactory();
		await using var store = new PostgresRateLimitCounterStore(
			throwingFactory,
			NullLogger<PostgresRateLimitCounterStore>.Instance,
			GetHostSettings<ApiRateLimitSettings>(),
			GetHostSettings<AnonymousAuthRateLimitSettings>(),
			timeProvider
		);

		// Open the breaker by exceeding the failure threshold.
		for (var attempt = 0; attempt < 5; attempt++) {
			await store.AcquireAsync(
				ApiRateLimitPolicies.AuthenticatedDefault,
				"breaker-key",
				10,
				TimeSpan.FromSeconds(60),
				1,
				timeProvider.UtcNowValue
			);
		}

		throwingFactory.DialAttempts.Should().Be(5);

		// The breaker is now OPEN. A fail-CLOSED abuse policy must reject
		// without dialling, while a fail-OPEN policy admits.
		var failClosedResult = await store.AcquireAsync(
			AnonymousAuthRateLimitPolicies.PerIp,
			"abuse-key",
			5,
			TimeSpan.FromSeconds(60),
			1,
			timeProvider.UtcNowValue
		);
		var failOpenResult = await store.AcquireAsync(
			ApiRateLimitPolicies.AuthenticatedDefault,
			"non-abuse-key",
			100,
			TimeSpan.FromSeconds(60),
			1,
			timeProvider.UtcNowValue
		);

		throwingFactory.DialAttempts.Should()
			.Be(5, "the open breaker must not dial Postgres");
		failClosedResult.Acquired.Should().BeFalse(
			"fail-CLOSED abuse policy must reject during an outage"
		);
		failClosedResult.StoreFailure.Should().BeFalse(
			"the rejection is a deliberate policy decision, not a store failure"
		);
		failOpenResult.Acquired.Should().BeFalse();
		failOpenResult.StoreFailure.Should().BeTrue(
			"fail-OPEN policy signals the caller to admit"
		);
	}

	[Fact]
	public async Task ItShouldConsumeNothingOnRejectionAndRolloverCleanly() {
		await using var scope = _fixture.Factory.Services
			.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await dbContext.ClearCounterRowsAsync();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var policyName = $"spec-rollover-{suffix}";
		const string partitionKey = "rejection-does-not-consume";
		const int permitLimit = 2;
		// A 1-second window so the DB clock (floor(EXTRACT(EPOCH FROM now())
		// / $4) * $4) rolls over within the test — the app's utcNow parameter
		// no longer drives window alignment (#1546).
		var window = TimeSpan.FromSeconds(1);

		await using var store = CreateStoreFromHost();

		var firstScope = await store.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			window,
			1,
			BaseTime
		);
		var secondScope = await store.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			window,
			1,
			BaseTime
		);
		var rejected = await store.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			window,
			2,
			BaseTime
		);
		// Wait long enough for the DB-clock window to roll over to the
		// next second, replenishing the budget.
		await Task.Delay(TimeSpan.FromMilliseconds(1_100));
		var rolledOver = await store.AcquireAsync(
			policyName,
			partitionKey,
			permitLimit,
			window,
			1,
			BaseTime
		);

		firstScope.Acquired.Should().BeTrue();
		secondScope.Acquired.Should().BeTrue();
		rejected.Acquired.Should().BeFalse(
			"a request larger than what remains must be refused whole"
		);
		rolledOver.Acquired.Should().BeTrue(
			"a new aligned window replenishes the budget fully"
		);
		rolledOver.NewPermitCount.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldNeverPersistRawPartitionKeys() {
		await using var scope = _fixture.Factory.Services
			.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		await dbContext.ClearCounterRowsAsync();

		var suffix = Guid.NewGuid().ToString("N")[..8];
		var policyName = $"spec-no-pii-{suffix}";
		const string emailKey = "person-of-interest@example.com";

		await using var store = CreateStoreFromHost();
		await store.AcquireAsync(
			policyName,
			emailKey,
			10,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);

		var storedHashes = await dbContext.Database
			.SqlQuery<string>(
				$"""
				SELECT partition_key_hash AS "Value"
				FROM rate_limit_counters
				WHERE policy_name = {policyName}
				"""
			)
			.ToListAsync();

		storedHashes.Should().ContainSingle();
		storedHashes.Single().Should()
			.Be(PostgresRateLimitCounterStore.HashPartitionKey(emailKey));
		storedHashes.Single().Should().NotContain("@");
	}

	[Fact]
	public async Task ItShouldFailClosedForAbusePoliciesWhenTheStoreIsUnreachable() {
		await using var store = CreateStoreWithBrokenDatabase();

		var perIpResult = await store.AcquireAsync(
			AnonymousAuthRateLimitPolicies.PerIp,
			"203.0.113.9",
			5,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var passwordResetResult = await store.AcquireAsync(
			AnonymousAuthRateLimitPolicies.PasswordResetPerEmail,
			"sprayed@example.com",
			5,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var emailResult = await store.AcquireAsync(
			ApiRateLimitPolicies.EmailOperation,
			"session-fingerprint",
			5,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);

		perIpResult.StoreFailure.Should().BeFalse();
		perIpResult.Acquired.Should().BeFalse(
			"failing open would hand unlimited login-guess budgets to whoever arrives during the incident"
		);
		passwordResetResult.Acquired.Should().BeFalse();
		passwordResetResult.StoreFailure.Should().BeFalse();
		emailResult.Acquired.Should().BeFalse();
		emailResult.StoreFailure.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldFailOpenForNonAbusePoliciesWhenTheStoreIsUnreachable() {
		await using var store = CreateStoreWithBrokenDatabase();

		var authenticatedResult = await store.AcquireAsync(
			ApiRateLimitPolicies.AuthenticatedDefault,
			"session-fingerprint",
			100,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var bulkResult = await store.AcquireAsync(
			ApiRateLimitPolicies.BulkOperation,
			"session-fingerprint",
			100,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);

		authenticatedResult.Acquired.Should().BeFalse();
		authenticatedResult.StoreFailure.Should().BeTrue(
			"domain work already requires Postgres; admitting keeps degradation from becoming outage"
		);
		bulkResult.Acquired.Should().BeFalse();
		bulkResult.StoreFailure.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldOpenTheBreakerStopDiallingThenProbeAfterCooldown() {
		var timeProvider = new ManualTimeProvider {
			UtcNowValue = BaseTime,
		};
		var throwingFactory = new ThrowingScopeFactory();
		await using var store = new PostgresRateLimitCounterStore(
			throwingFactory,
			NullLogger<PostgresRateLimitCounterStore>.Instance,
			GetHostSettings<ApiRateLimitSettings>(),
			GetHostSettings<AnonymousAuthRateLimitSettings>(),
			timeProvider
		);

		for (var attempt = 0; attempt < 4; attempt++) {
			await store.AcquireAsync(
				ApiRateLimitPolicies.AuthenticatedDefault,
				"breaker-key",
				10,
				TimeSpan.FromSeconds(60),
				1,
				timeProvider.UtcNowValue
			);
		}

		throwingFactory.DialAttempts.Should().Be(4);

		var fifth = await store.AcquireAsync(
			ApiRateLimitPolicies.AuthenticatedDefault,
			"breaker-key",
			10,
			TimeSpan.FromSeconds(60),
			1,
			timeProvider.UtcNowValue
		);
		fifth.StoreFailure.Should().BeTrue();
		throwingFactory.DialAttempts.Should().Be(5);

		for (var attempt = 0; attempt < 10; attempt++) {
			await store.AcquireAsync(
				ApiRateLimitPolicies.AuthenticatedDefault,
				"breaker-key",
				10,
				TimeSpan.FromSeconds(60),
				1,
				timeProvider.UtcNowValue
			);
		}

		throwingFactory.DialAttempts.Should().Be(
			5,
			"while the breaker is open acquisitions must not dial Postgres at all"
		);

		timeProvider.UtcNowValue = BaseTime.AddSeconds(31);
		await store.AcquireAsync(
			ApiRateLimitPolicies.AuthenticatedDefault,
			"breaker-key",
			10,
			TimeSpan.FromSeconds(60),
			1,
			timeProvider.UtcNowValue
		);

		throwingFactory.DialAttempts.Should().Be(
			6,
			"after the cooldown exactly one half-open probe may dial"
		);

		timeProvider.UtcNowValue = BaseTime.AddSeconds(32);
		await store.AcquireAsync(
			ApiRateLimitPolicies.AuthenticatedDefault,
			"breaker-key",
			10,
			TimeSpan.FromSeconds(60),
			1,
			timeProvider.UtcNowValue
		);

		throwingFactory.DialAttempts.Should().Be(
			6,
			"a failed probe re-opens the breaker immediately"
		);
	}

	[Fact]
	public async Task ItShouldMirrorPre953FixedWindowSemanticsInTheMemoryStore() {
		await using var store = new MemoryRateLimitCounterStore();

		var first = await store.AcquireAsync(
			"memory-spec-policy",
			"one-key",
			1,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var rejected = await store.AcquireAsync(
			"memory-spec-policy",
			"one-key",
			1,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var otherPartition = await store.AcquireAsync(
			"memory-spec-policy",
			"other-key",
			1,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime
		);
		var rolledOver = await store.AcquireAsync(
			"memory-spec-policy",
			"one-key",
			1,
			TimeSpan.FromSeconds(60),
			1,
			BaseTime.AddSeconds(61)
		);

		first.Acquired.Should().BeTrue();
		rejected.Acquired.Should().BeFalse();
		otherPartition.Acquired.Should().BeTrue();
		rolledOver.Acquired.Should().BeTrue();
	}

	private PostgresRateLimitCounterStore
		CreateStoreFromHost() {
		return new PostgresRateLimitCounterStore(
			_fixture.Factory.Services
				.GetRequiredService<IServiceScopeFactory>(),
			_fixture.Factory.Services.GetRequiredService<
				ILogger<PostgresRateLimitCounterStore>>(),
			GetHostSettings<ApiRateLimitSettings>(),
			GetHostSettings<AnonymousAuthRateLimitSettings>()
		);
	}

	private PostgresRateLimitCounterStore
		CreateStoreWithBrokenDatabase() {
		return new PostgresRateLimitCounterStore(
			new ThrowingScopeFactory(),
			NullLogger<PostgresRateLimitCounterStore>.Instance,
			GetHostSettings<ApiRateLimitSettings>(),
			GetHostSettings<AnonymousAuthRateLimitSettings>(),
			new ManualTimeProvider { UtcNowValue = BaseTime }
		);
	}

	private T GetHostSettings<T>() where T : notnull {
		return _fixture.Factory.Services
			.GetRequiredService<T>();
	}

	private sealed class ManualTimeProvider : TimeProvider {
		public DateTimeOffset UtcNowValue { get; set; }

		public override DateTimeOffset GetUtcNow() {
			return UtcNowValue;
		}
	}

	private sealed class ThrowingScopeFactory
		: IServiceScopeFactory {
		public int DialAttempts { get; private set; }

		public IServiceScope CreateScope() {
			DialAttempts++;
			throw new InvalidOperationException(
				"simulated database outage"
			);
		}
	}
}

internal static class PostgresRateLimitCounterStoreSpecQueries {
	// Widen the reset helper onto DbContext so each fact starts from an empty
	// counters table without depending on evaluation order.
	public static async Task ClearCounterRowsAsync(
		this AppDbContext dbContext
	) {
		await dbContext.Database.ExecuteSqlRawAsync(
			"DELETE FROM rate_limit_counters"
		);
	}
}
