namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Process-local scheduler liveness state (design §7.2): the leader path writes it, the
/// §7.2 sampler reads it to emit <c>scheduler.last_sync_at</c> and evaluate the
/// sync-staleness condition (R2-10). It is deliberately in-process and NOT a durable
/// row — the spec's table makes <c>scheduler.last_sync_at</c> a gauge the LEADER emits,
/// because only the replica running <see cref="Quartz.SyncSystemJobsJob"/> knows whether
/// its own reconcile is still progressing. A wedged-but-present leader is exactly the
/// failure this catches: the advisory lock is still held (so
/// <c>scheduler.leader_present</c> reads 1 and the leader-absence condition stays quiet)
/// while reconciliation has silently stopped.
///
/// <see cref="StalenessBaseline"/> falls back to the moment leadership was acquired, so a
/// leader that is wedged FROM BIRTH — elected but never completing a first sync — still
/// breaches, rather than waiting forever on a <c>LastSyncAt</c> that never arrives.
/// Leadership loss resets both, so a demoted replica cannot keep alerting on the stale
/// timestamp it happens to still be holding.
///
/// Thread-safe: the sampler reads on its own timer while the Quartz thread writes.
/// <c>leaderSince</c> and <c>lastSyncAt</c> are NOT two independent fields — they are one
/// immutable <see cref="Snapshot"/> published by a single atomic reference swap, so a
/// reader (e.g. <see cref="StalenessBaseline"/>) always observes a self-consistent pair.
/// Two independent fields could tear: a sampler that read a still-non-null
/// <c>leaderSince</c>, then read a <c>lastSyncAt</c> zeroed by a concurrent demotion,
/// would warn about stale sync from an already-demoted replica; and a sync completing
/// after demotion could leave a stale <c>lastSyncAt</c> behind. The single-snapshot swap
/// plus the epoch-fenced compare-and-swap in
/// <see cref="MarkSyncCompletedAt(DateTimeOffset, long)"/> (which drops a sync that races a
/// demotion OR a later re-election) close both.
///
/// Timestamps are process-clock UTC, and every consumer of them is in THIS process, so
/// the F11 database-time rule (which exists to keep cross-process durable predicates on
/// one clock) does not apply.
/// </summary>
public sealed class SchedulerSyncState {
	// One coherent leadership snapshot. A demotion or election replaces the WHOLE record in
	// a single reference swap, so no reader can pair a leaderSince from one leadership era
	// with a lastSyncAt from another. Epoch is a MONOTONIC leadership-era generation: each
	// election increments it and it is NEVER reused (a demotion preserves it), so a sync that
	// was started in one era can be told apart from a later era even across an A→Unelected→B
	// re-election that lands the same leaderSince-shape — the era-ABA F4 completion CANNOT be
	// stamped into the new leadership because its captured epoch no longer matches.
	private sealed record Snapshot(long Epoch, DateTimeOffset? LeaderSince, DateTimeOffset? LastSyncAt);

	private static readonly Snapshot Unelected = new(0, null, null);

	private Snapshot _snapshot = Unelected;

	/// <summary>When this replica acquired leadership; null when it is not the leader.</summary>
	public DateTimeOffset? LeaderSince {
		get { return Volatile.Read(ref _snapshot).LeaderSince; }
	}

	/// <summary>
	/// When this replica last completed a reconcile pass; null when it has not completed
	/// one under its current leadership (including when it is not the leader).
	/// </summary>
	public DateTimeOffset? LastSyncAt {
		get { return Volatile.Read(ref _snapshot).LastSyncAt; }
	}

	/// <summary>
	/// The instant sync staleness is measured from, or null when this replica is not the
	/// leader and therefore owes no sync: the last completed sync, else the moment
	/// leadership began. Read from ONE snapshot so the two fields are always coherent.
	/// </summary>
	public DateTimeOffset? StalenessBaseline {
		get {
			var snapshot = Volatile.Read(ref _snapshot);
			if (snapshot.LeaderSince is null) {
				return null;
			}

			return snapshot.LastSyncAt ?? snapshot.LeaderSince;
		}
	}

	/// <summary>
	/// The current leadership era generation. A reconcile pass captures this at its START
	/// and passes it to <see cref="MarkSyncCompletedAt(DateTimeOffset, long)"/> at its END,
	/// so a completion is stamped ONLY if leadership has not turned over meanwhile.
	/// </summary>
	public long CurrentEpoch {
		get { return Volatile.Read(ref _snapshot).Epoch; }
	}

	public void MarkLeadershipAcquired() {
		MarkLeadershipAcquiredAt(DateTimeOffset.UtcNow);
	}

	/// <summary>Explicit-instant overload so specs drive staleness deterministically.</summary>
	public void MarkLeadershipAcquiredAt(DateTimeOffset acquiredAt) {
		// Election resets lastSyncAt to null AND advances the era epoch in the SAME swap: a
		// new leadership era never inherits the prior era's last-sync timestamp, and its epoch
		// is strictly greater than any era a still-in-flight reconcile could have captured.
		while (true) {
			var current = Volatile.Read(ref _snapshot);
			var elected = new Snapshot(current.Epoch + 1, acquiredAt, null);
			if (ReferenceEquals(
				Interlocked.CompareExchange(ref _snapshot, elected, current), current
			)) {
				return;
			}
		}
	}

	public void MarkLeadershipLost() {
		// Demotion clears the timestamps but PRESERVES the epoch, so the next election's
		// epoch = preserved + 1 is still strictly greater than this era's — an A→Unelected→B
		// cycle never reuses A's epoch, which is what makes the completion fence below sound.
		while (true) {
			var current = Volatile.Read(ref _snapshot);
			var demoted = new Snapshot(current.Epoch, null, null);
			if (ReferenceEquals(
				Interlocked.CompareExchange(ref _snapshot, demoted, current), current
			)) {
				return;
			}
		}
	}

	public void MarkSyncCompleted() {
		MarkSyncCompletedAt(DateTimeOffset.UtcNow);
	}

	/// <summary>
	/// Convenience overload that stamps against whatever era is current NOW. Use only where
	/// the completion cannot outlive its era (no re-election can interleave). The reconcile
	/// path uses <see cref="MarkSyncCompletedAt(DateTimeOffset, long)"/> with a captured epoch.
	/// </summary>
	public void MarkSyncCompletedAt(DateTimeOffset completedAt) {
		MarkSyncCompletedAt(completedAt, Volatile.Read(ref _snapshot).Epoch);
	}

	/// <summary>
	/// Records a completed reconcile, fenced to the leadership era it ran under. The
	/// compare-and-swap drops the completion when (a) this replica no longer leads, OR (b) a
	/// re-election has advanced the era past <paramref name="epoch"/> — so an era-A reconcile
	/// that finishes after an A→Unelected→B turnover cannot stamp a stale sync into era B and
	/// make a newly elected but wedged scheduler look recently synced (F4).
	/// </summary>
	public void MarkSyncCompletedAt(DateTimeOffset completedAt, long epoch) {
		while (true) {
			var current = Volatile.Read(ref _snapshot);
			if (current.LeaderSince is null || current.Epoch != epoch) {
				return;
			}

			var updated = current with { LastSyncAt = completedAt };
			if (ReferenceEquals(
				Interlocked.CompareExchange(ref _snapshot, updated, current), current
			)) {
				return;
			}
		}
	}
}
