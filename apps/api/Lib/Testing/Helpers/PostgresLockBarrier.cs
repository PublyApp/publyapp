using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// Turns "we started some concurrent work" into "every contender has provably reached the
/// contended lock and none has passed it".
/// </summary>
/// <remarks>
/// A concurrency spec that merely fires N tasks proves nothing: the schedule where they run one
/// after another passes without any protection in place. These helpers let a spec hold the
/// contended row lock itself, wait until every contender is parked on it, and only then release
/// it — so the interleaving under test is the one that actually executes.
/// </remarks>
internal static class PostgresLockBarrier {
	/// <summary>
	/// Backend pid of the connection behind <paramref name="dbContext"/>. Issued through EF so it
	/// is guaranteed to run on the same connection — and therefore the same transaction — as the
	/// barrier's own lock statements.
	/// </summary>
	internal static async Task<int> GetBackendPidAsync(
		AppDbContext dbContext,
		CancellationToken cancellationToken = default
	) {
		return await dbContext.Database
			.SqlQuery<int>($"""SELECT pg_backend_pid()::int AS "Value" """)
			.FirstAsync(cancellationToken);
	}

	/// <summary>
	/// Blocks until <paramref name="expectedCount"/> backends are parked waiting on the barrier
	/// transaction identified by <paramref name="barrierPid"/>.
	/// </summary>
	/// <remarks>
	/// <para>
	/// The wait is <b>recursive</b> because PostgreSQL serialises row-lock waiters through tuple
	/// locks: only the first contender waits directly on the barrier, and the rest queue behind
	/// that contender. Counting direct waiters alone would never reach the expected number.
	/// </para>
	/// <para>
	/// It is <b>rooted at the barrier's own pid</b> because test classes run in parallel against
	/// one database: a global count of lock waiters could be satisfied by an unrelated spec and
	/// release the barrier early.
	/// </para>
	/// </remarks>
	internal static async Task WaitUntilBlockedAsync(
		IServiceProvider services,
		int expectedCount,
		int barrierPid,
		CancellationToken cancellationToken = default
	) {
		var deadline = DateTime.UtcNow.AddSeconds(30);

		while (DateTime.UtcNow < deadline) {
			await using var scope = services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

			var blocked = await dbContext.Database
				.SqlQuery<int>($"""
					WITH RECURSIVE waiters AS (
						SELECT pid FROM pg_stat_activity
						WHERE datname = current_database()
							AND {barrierPid} = ANY(pg_blocking_pids(pid))
						UNION
						SELECT sa.pid FROM pg_stat_activity sa, waiters w
						WHERE sa.datname = current_database()
							AND w.pid = ANY(pg_blocking_pids(sa.pid))
					)
					SELECT count(*)::int AS "Value" FROM waiters
					""")
				.FirstAsync(cancellationToken);

			if (blocked >= expectedCount) {
				return;
			}

			await Task.Delay(50, cancellationToken);
		}

		throw new InvalidOperationException(
			$"Timed out waiting for {expectedCount} operation(s) to park on the row lock held "
			+ "by the barrier transaction. Either the lock is no longer taken before the guarded "
			+ "read, or the lock order changed — both defeat the protection the calling spec "
			+ "exists to prove."
		);
	}
}
