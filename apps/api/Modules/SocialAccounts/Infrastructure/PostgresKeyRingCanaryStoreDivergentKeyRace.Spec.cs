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
/// #1424 (follow-up to #1416/#1420, adversarial review round 1): the divergent-key
/// lost-race path was pinned only through the in-memory ScriptedCanaryStore. These specs
/// drive it through the REAL <see cref="PostgresKeyRingCanaryStore"/> on real Postgres:
/// two concurrent FIRST boots mint under DIFFERENT <c>SOCIAL_ACCOUNTS_MASTER_KEY</c>
/// values — the api/worker divergence the canary exists to catch. The unique partial
/// index leaves exactly one row; the loser cannot verify the winner's blob and must
/// refuse to start with the plain-words WrongKey cause naming the operator action,
/// never adopt it silently. The winner's row survives byte-identical.
/// </summary>
[Collection("WitnessBootChildProcess")]
public sealed class PostgresKeyRingCanaryStoreDivergentKeyRaceSpec {
	[Fact]
	public async Task ItShouldRefuseExactlyOneBootWithTheWrongKeyCauseWhenTwoFirstBootsMintUnderDifferentKeys() {
		await using var db = await WitnessTestDatabase.CreateAsync();

		var services = new ServiceCollection();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(db.ConnectionString));
		await using var provider = services.BuildServiceProvider();
		var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

		// Two honestly generated test-only keys: the divergent api/worker configuration.
		var keyA = NewTestKey();
		var keyB = NewTestKey();

		// Both boots observe the empty canary before either mints, so the race is
		// deterministic: both arrive at Write() together and the index decides the winner.
		var startingGate = new Barrier(participantCount: 2);
		var outcomes = new ConcurrentBag<BootOutcome>();

		var racers = new[] { keyA, keyB }.Select(key => Task.Run(() => {
			if (!startingGate.SignalAndWait(TimeSpan.FromSeconds(30))) {
				outcomes.Add(new BootOutcome(false, "racer never reached the start gate"));
				return;
			}

			var store = new PostgresKeyRingCanaryStore(scopeFactory);
			try {
				SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(key, store);
				outcomes.Add(new BootOutcome(true, null));
			} catch (Exception ex) {
				outcomes.Add(new BootOutcome(false, ex.Message));
			}
		})).ToArray();

		await Task.WhenAll(racers);

		outcomes.Should().HaveCount(2, "both boots must report an outcome");
		outcomes.Count(outcome => outcome.Passed).Should().Be(
			1,
			"with DIFFERENT keys the loser cannot verify the winner's canary and must "
				+ "refuse to start; outcomes were: "
				+ string.Join(" | ", outcomes.Select(Describe)));

		var loserError = outcomes.Single(outcome => !outcome.Passed).Error;
		loserError.Should().Contain(
			SocialAccountsMasterKeyWitness.WrongKeyMessagePrefix,
			"the refusal must be the plain-words WrongKey cause, never silent adoption");
		loserError.Should().Contain(
			"Restore the original SOCIAL_ACCOUNTS_MASTER_KEY",
			"the WrongKey cause must name the operator ACTION");
		loserError.Should().Contain(
			PostgresKeyRingCanaryStore.RowName,
			"the rotation path must name the stale canary row");

		await using var scope = scopeFactory.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var rows = await dbContext.DataProtectionKeys.AsNoTracking()
			.Where(k => k.FriendlyName == PostgresKeyRingCanaryStore.RowName)
			.ToListAsync();

		rows.Should().ContainSingle(
			"the database itself refuses the second canary row behind the unique partial index");
	}

	[Fact]
	public async Task ItShouldLeaveTheWinnerRowByteIdenticalAndStillBootingAfterTheLoserRefuses() {
		await using var db = await WitnessTestDatabase.CreateAsync();

		var services = new ServiceCollection();
		services.AddDbContext<AppDbContext>(options => options.UseNpgsql(db.ConnectionString));
		await using var provider = services.BuildServiceProvider();
		var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

		var keyA = NewTestKey();
		var keyB = NewTestKey();

		// Deterministic sequencing of the same race: boot A wins the mint cleanly; boot B
		// holds the stale empty view (FrozenEmptyCanaryStore), collides on insert (23505
		// swallowed), then verifies A's blob under keyB and must refuse. Sequencing the
		// loser explicitly pins WHICH row survives byte-for-byte, independent of which
		// racer the index picks behind the barrier above.
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			keyA,
			new PostgresKeyRingCanaryStore(scopeFactory));

		await using var readScope = scopeFactory.CreateAsyncScope();
		var readContext = readScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var winnerBlobBefore = await readContext.DataProtectionKeys.AsNoTracking()
			.Where(k => k.FriendlyName == PostgresKeyRingCanaryStore.RowName)
			.Select(k => k.Xml)
			.SingleAsync();

		var losingBoot = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			keyB,
			new FrozenEmptyCanaryStore(new PostgresKeyRingCanaryStore(scopeFactory)));

		losingBoot.Should().Throw<InvalidOperationException>()
			.Which.Message.Should().Contain(
				SocialAccountsMasterKeyWitness.WrongKeyMessagePrefix,
				"a boot that cannot decrypt the winner's canary refuses with the WrongKey "
					+ "cause (#1424)");

		await using var verifyScope = scopeFactory.CreateAsyncScope();
		var verifyContext = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var rowsAfter = await verifyContext.DataProtectionKeys.AsNoTracking()
			.Where(k => k.FriendlyName == PostgresKeyRingCanaryStore.RowName)
			.ToListAsync();

		rowsAfter.Should().ContainSingle("the loser's insert is refused by the index");
		rowsAfter.Single().Xml.Should().Be(
			winnerBlobBefore,
			"the winner's row survives the loser's refused write byte-identical");

		// And the winner still boots: its own blob verifies under keyA.
		var winnerStillBoots = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			keyA,
			new PostgresKeyRingCanaryStore(scopeFactory));
		winnerStillBoots.Should().NotThrow("the winner's boot contract is unchanged");
	}

	private static string Describe(BootOutcome outcome) {
		return outcome.Passed ? "PASSED" : "REFUSED: " + outcome.Error;
	}

	private sealed record BootOutcome(bool Passed, string? Error);

	/// <summary>
	/// Wraps the real store but reports the canary as MISSING on the first read, replaying
	/// the stale-empty view a mint-race loser holds before its insert collides with the
	/// winner's committed row. Same seam as the sibling concurrency spec.
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
