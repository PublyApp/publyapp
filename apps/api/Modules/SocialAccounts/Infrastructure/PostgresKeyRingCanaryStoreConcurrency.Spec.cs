using System.Collections.Concurrent;

using System.Security.Cryptography;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// #1416 (production incident 2026-08-25): the first-boot mint of the master-key canary
/// is not concurrency-safe. On a fresh deployment `api`, `worker`, and `migrate` boot
/// together against an EMPTY canary; every process reads null, every process inserts,
/// and because nothing made the friendly name unique, several
/// `social-accounts-master-key-canary` rows land in <c>data_protection_keys</c>. Every
/// LATER boot then dies in <c>Read()</c>'s SingleOrDefault with
/// "Sequence contains more than one element" and crash-loops forever.
/// <para>
/// This spec reproduces that race DETERMINISTICALLY against real infrastructure: N
/// concurrent first boots run the REAL <see cref="PostgresKeyRingCanaryStore"/> plus the
/// REAL <see cref="SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable"/> against a
/// template-cloned Postgres database, held on a barrier so every Read() observes the
/// empty canary before any Write() fires — the exact production shape, minus the timing
/// luck. The fix contract: exactly ONE canary row survives and EVERY boot passes.
/// </para>
/// </summary>
[Collection("WitnessBootChildProcess")]
public sealed class PostgresKeyRingCanaryStoreConcurrencySpec {
	private const int RacerCount = 6;

	private sealed record BootOutcome(bool Passed, string? Error);

	[Fact]
	public async Task ItShouldKeepExactlyOneCanaryRowWhenSixFirstBootsRaceBehindABarrier() {
		await using var db = await WitnessTestDatabase.CreateAsync();

		var services = new ServiceCollection();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(db.ConnectionString));
		await using var provider = services.BuildServiceProvider();
		var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

		// Production reality: api, worker, and migrate all receive the SAME
		// SOCIAL_ACCOUNTS_MASTER_KEY value (runbook requirement), so every racer here
		// shares one honestly generated test-only key.
		var sharedKey = NewTestKey();
		var startingGate = new Barrier(RacerCount);
		var outcomes = new ConcurrentBag<BootOutcome>();

		var racers = Enumerable.Range(0, RacerCount).Select(_ => Task.Run(() => {
			// Hold every boot at the gate until all six are parked past their Read()
			// decision point, then release them together: under the pre-fix code every
			// Read() returns null, every Write() inserts, and the duplicate is certain —
			// no scheduler-timing luck involved.
			if (!startingGate.SignalAndWait(TimeSpan.FromSeconds(30))) {
				outcomes.Add(new BootOutcome(false, "racer never reached the start gate"));
				return;
			}

			var store = new PostgresKeyRingCanaryStore(scopeFactory);
			try {
				SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(sharedKey, store);
				outcomes.Add(new BootOutcome(true, null));
			} catch (Exception ex) {
				outcomes.Add(new BootOutcome(false, ex.Message));
			}
		}));

		await Task.WhenAll(racers);

		outcomes.Where(outcome => !outcome.Passed).Should().BeEmpty(
			"every racing first boot must come up (a loser must verify and adopt the "
				+ "winner's canary, never crash); failures: "
				+ string.Join(" | ", outcomes.Where(o => !o.Passed).Select(o => o.Error)));

		await using var scope = scopeFactory.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var canaryRowCount = await dbContext.DataProtectionKeys.AsNoTracking().CountAsync(
			key => key.FriendlyName == PostgresKeyRingCanaryStore.RowName);

		canaryRowCount.Should().Be(
			1,
			"concurrent first boots mint the canary exactly once; extra rows make every "
				+ "later boot die in SingleOrDefault with 'Sequence contains more than one "
				+ "element' (#1416)");
	}

	[Fact]
	public async Task ItShouldVerifyTheWinningCanaryWhenABootLosesTheMintRace() {
		// Complement to the barrier race above: pins the LOSER side of the contract
		// directly. A boot that finds an empty canary, races its insert, and loses must
		// finish by verifying the winner's blob under THIS process's key — not overwrite
		// it, not skip verification. Seeded here with an already-present winner so the
		// store's write path exercises the lost-race branch deterministically.
		await using var db = await WitnessTestDatabase.CreateAsync();

		var services = new ServiceCollection();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(db.ConnectionString));
		await using var provider = services.BuildServiceProvider();
		var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
		var sharedKey = NewTestKey();

		// Boot 1 wins cleanly: mints the canary.
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(sharedKey, new PostgresKeyRingCanaryStore(scopeFactory));
		var winnerBlob = await CanaryBlobOf(scopeFactory);
		winnerBlob.Should().NotBeNull("boot 1 must have minted exactly one canary row");

		// Boot 2 starts from a deliberately STALE read (empty) even though the row now
		// exists: exactly the state a loser discovers behind the barrier in production.
		var losingBoot = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			sharedKey,
			new FrozenEmptyCanaryStore(new PostgresKeyRingCanaryStore(scopeFactory))
		);

		losingBoot.Should().NotThrow(
			"a boot that loses the mint race must verify and adopt the winner's canary");

		await using var scope = scopeFactory.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var rows = await dbContext.DataProtectionKeys.AsNoTracking()
			.Where(key => key.FriendlyName == PostgresKeyRingCanaryStore.RowName)
			.ToListAsync();

		rows.Should().ContainSingle("the loser must not insert a second row");
		rows.Single().Xml.Should().Be(winnerBlob,
			"the winner's blob must survive the loser's write untouched");
	}

	private static async Task<string?> CanaryBlobOf(IServiceScopeFactory scopeFactory) {
		await using var scope = scopeFactory.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.DataProtectionKeys.AsNoTracking()
			.Where(key => key.FriendlyName == PostgresKeyRingCanaryStore.RowName)
			.Select(key => key.Xml)
			.SingleOrDefaultAsync();
	}

	/// <summary>
	/// Wraps the real store but reports the canary as MISSING on the first read, replaying
	/// the stale-empty view a mint-race loser holds before its insert collides with the
	/// winner's committed row.
	/// </summary>
	private sealed class FrozenEmptyCanaryStore : IKeyRingCanaryStore {
		private readonly IKeyRingCanaryStore _inner;
		private bool _emptinessReported;

		public FrozenEmptyCanaryStore(IKeyRingCanaryStore inner) {
			_inner = inner;
		}

		public string? Read() {
			if (_emptinessReported) {
				return _inner.Read();
			}

			_emptinessReported = true;
			return null;
		}

		public void Write(string blob) {
			_inner.Write(blob);
		}
	}

	private static byte[] NewTestKey() {
		// Test-only random 32-byte value (never a secret, never committed): satisfies the
		// witness's entropy floor like an honestly generated openssl rand -base64 32 key.
		var key = new byte[32];
		RandomNumberGenerator.Fill(key);
		return key;
	}
}
