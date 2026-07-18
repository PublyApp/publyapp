using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// F8: leaderSince and lastSyncAt must form ONE coherent snapshot. These specs pin the two
// interleavings the two-field design got wrong — a sync completing after demotion, and a
// re-election inheriting the prior era's sync — plus a barrier-driven demote race whose
// invariant the old unconditional lastSyncAt write violated.
//
// F4: leadership carries a monotonic era epoch, so a completion is fenced to the era it
// started in. The deterministic three-phase A -> Unelected -> B barrier below proves a
// stale era-A completion is dropped rather than stamped into era B (an era-ABA re-election),
// which the probabilistic demote race alone could not deterministically reach.
public sealed class SchedulerSyncStateSpec {
	[Fact]
	public void ItShouldDropASyncThatCompletesAfterDemotion() {
		var state = new SchedulerSyncState();
		state.MarkLeadershipAcquiredAt(DateTimeOffset.UtcNow.AddMinutes(-5));

		state.MarkLeadershipLost();
		// A reconcile pass that finishes just after this replica lost leadership must not
		// resurrect a lastSyncAt — otherwise a demoted replica reports a live sync.
		state.MarkSyncCompletedAt(DateTimeOffset.UtcNow);

		state.LastSyncAt.Should().BeNull(
			"a sync that completes after demotion is dropped, not recorded"
		);
		state.StalenessBaseline.Should().BeNull(
			"a demoted replica owes no sync and must not report a staleness baseline"
		);
	}

	[Fact]
	public void ItShouldNotInheritThePriorLeadershipsSyncWhenReElected() {
		var state = new SchedulerSyncState();
		state.MarkLeadershipAcquiredAt(DateTimeOffset.UtcNow.AddMinutes(-10));
		state.MarkSyncCompletedAt(DateTimeOffset.UtcNow.AddMinutes(-9));
		state.MarkLeadershipLost();

		var reElectedAt = DateTimeOffset.UtcNow;
		state.MarkLeadershipAcquiredAt(reElectedAt);

		state.LastSyncAt.Should().BeNull(
			"a new leadership era starts with no completed sync — the acquire resets it in "
			+ "the same atomic swap, so the prior era's timestamp cannot leak through"
		);
		state.StalenessBaseline.Should().Be(
			reElectedAt,
			"with no sync yet, staleness is measured from the election instant, not a stale "
			+ "sync from a previous leadership"
		);
	}

	[Fact]
	public void ItShouldMeasureStalenessFromTheLastSyncOnceOneCompletes() {
		var state = new SchedulerSyncState();
		state.MarkLeadershipAcquiredAt(DateTimeOffset.UtcNow.AddMinutes(-10));

		var syncedAt = DateTimeOffset.UtcNow.AddMinutes(-1);
		state.MarkSyncCompletedAt(syncedAt);

		state.StalenessBaseline.Should().Be(
			syncedAt, "once a sync completes under leadership it becomes the staleness baseline"
		);
	}

	// Barrier-driven demote race: a demotion and a sync-completion released together, many
	// times. The atomic snapshot guarantees the invariant "not leader ⇒ no lastSyncAt". The
	// old two-field code, whose MarkSyncCompleted wrote lastSyncAt unconditionally, violated
	// it whenever the sync write landed after the demotion zeroed the fields — so this spec
	// is a genuine red control, not a tautology.
	[Fact]
	public async Task ItShouldNeverLeaveALastSyncOnADemotedReplicaUnderAConcurrentDemoteSyncRace() {
		var state = new SchedulerSyncState();

		for (var i = 0; i < 2_000; i++) {
			var electedAt = DateTimeOffset.UtcNow;
			state.MarkLeadershipAcquiredAt(electedAt);

			using var barrier = new Barrier(2);
			var demote = Task.Run(() => {
				barrier.SignalAndWait();
				state.MarkLeadershipLost();
			});
			var sync = Task.Run(() => {
				barrier.SignalAndWait();
				state.MarkSyncCompletedAt(electedAt.AddMilliseconds(1));
			});

			await Task.WhenAll(demote, sync);

			// Reads after the race has quiesced, so they are themselves consistent.
			if (state.LeaderSince is null) {
				state.LastSyncAt.Should().BeNull(
					"a replica that is not the leader must never carry a lastSyncAt — a sync "
					+ "racing the demotion must be dropped, not left behind"
				);
				state.StalenessBaseline.Should().BeNull(
					"and its staleness baseline stays null, so no demoted replica alerts"
				);
			}
		}
	}

	// F4 era-ABA, as a DETERMINISTIC three-phase barrier rather than a probabilistic race:
	// a reconcile R1 starts under leadership A and captures its era epoch; a full
	// A -> Unelected -> B turnover happens; only THEN does R1 complete. Its completion must be
	// dropped — the stale sync cannot be stamped into era B, so a newly elected but wedged
	// scheduler is not made to look recently synced. Without the epoch fence, R1 would read a
	// non-null B leaderSince and CAS its old timestamp straight into the new leadership.
	[Fact]
	public void ItShouldDropAStaleCompletionFromAPriorEraAfterAnAbaReElection() {
		var state = new SchedulerSyncState();

		// Phase A: elected. R1 starts here and captures the era it must complete into.
		var electedAtA = DateTimeOffset.UtcNow.AddMinutes(-10);
		state.MarkLeadershipAcquiredAt(electedAtA);
		var epochAtReconcileStart = state.CurrentEpoch;

		// Phase Unelected -> Phase B: a demotion then a fresh re-election, a brand-new era.
		state.MarkLeadershipLost();
		var reElectedAtB = DateTimeOffset.UtcNow;
		state.MarkLeadershipAcquiredAt(reElectedAtB);
		state.CurrentEpoch.Should().NotBe(
			epochAtReconcileStart,
			"a re-election advances the monotonic era epoch, and a demotion never lets it be "
			+ "reused — so era B is distinguishable from era A"
		);

		// R1 (from era A) only now finishes and tries to stamp its long-stale completion.
		state.MarkSyncCompletedAt(electedAtA.AddMinutes(1), epochAtReconcileStart);

		state.LastSyncAt.Should().BeNull(
			"the era-A completion is fenced out of era B: a stale sync must not be stamped into "
			+ "a new leadership"
		);
		state.StalenessBaseline.Should().Be(
			reElectedAtB,
			"era B has completed no sync of its own, so staleness is measured from B's election "
			+ "— a wedged new leader still breaches instead of looking freshly synced"
		);
	}

	// Non-vacuity twin: the fence is not a blanket drop. A completion carrying the CURRENT era
	// epoch is recorded, so the epoch check rejects only stale-era completions.
	[Fact]
	public void ItShouldRecordACompletionThatCarriesTheCurrentEra() {
		var state = new SchedulerSyncState();
		state.MarkLeadershipAcquiredAt(DateTimeOffset.UtcNow.AddMinutes(-10));
		var epoch = state.CurrentEpoch;

		var syncedAt = DateTimeOffset.UtcNow.AddMinutes(-1);
		state.MarkSyncCompletedAt(syncedAt, epoch);

		state.LastSyncAt.Should().Be(
			syncedAt, "a completion whose captured epoch matches the current era is recorded"
		);
		state.StalenessBaseline.Should().Be(
			syncedAt, "and it becomes the staleness baseline for that era"
		);
	}
}
