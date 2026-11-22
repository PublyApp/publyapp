using System.Diagnostics;

namespace PublyApp.Api.Lib.Testing.Fixtures;

/// <summary>
/// Process-wide stopwatches for the costs every test class pays around its
/// private database: cloning the template, building the API host and (on a
/// long-lived local container) dropping the clone.
///
/// The one-line summary is printed at test-process exit so a before/after
/// comparison needs no profiler and no extra CI step.
/// </summary>
internal static class TestDbTimings {
	private static long _CloneTicks;
	private static long _HostTicks;
	private static long _DropTicks;
	private static int _ClassCount;
	private static int _CloneCount;
	private static int _HostCount;
	private static int _DropCount;
	private static int _Reported;

	public static void CountClass() {
		Interlocked.Increment(ref TestDbTimings._ClassCount);
	}

	public static void RecordClone(long startedAt) {
		Interlocked.Add(
			ref TestDbTimings._CloneTicks,
			Stopwatch.GetElapsedTime(startedAt).Ticks
		);
		Interlocked.Increment(ref TestDbTimings._CloneCount);
	}

	public static void RecordHost(long startedAt) {
		Interlocked.Add(
			ref TestDbTimings._HostTicks,
			Stopwatch.GetElapsedTime(startedAt).Ticks
		);
		Interlocked.Increment(ref TestDbTimings._HostCount);
	}

	public static void RecordDrop(long startedAt) {
		Interlocked.Add(
			ref TestDbTimings._DropTicks,
			Stopwatch.GetElapsedTime(startedAt).Ticks
		);
		Interlocked.Increment(ref TestDbTimings._DropCount);
	}

	/// <summary>
	/// Prints the summary exactly once. Called from the process-exit handler,
	/// after every class fixture has been disposed.
	/// </summary>
	public static void Report() {
		if (Interlocked.Exchange(ref TestDbTimings._Reported, 1) != 0) {
			return;
		}

		var classes = Volatile.Read(ref TestDbTimings._ClassCount);
		if (classes == 0) {
			return;
		}

		var clone = new TimeSpan(Interlocked.Read(ref TestDbTimings._CloneTicks));
		var host = new TimeSpan(Interlocked.Read(ref TestDbTimings._HostTicks));
		var drop = new TimeSpan(Interlocked.Read(ref TestDbTimings._DropTicks));
		var clones = Volatile.Read(ref TestDbTimings._CloneCount);
		var hosts = Volatile.Read(ref TestDbTimings._HostCount);
		var drops = Volatile.Read(ref TestDbTimings._DropCount);

		Console.Error.WriteLine(
			$"[test-db] timings classes={classes} "
			+ $"clone={clone.TotalMilliseconds:0}ms/{clones} "
			+ $"({TestDbTimings._PerItem(clone, clones):0}ms each) "
			+ $"host={host.TotalMilliseconds:0}ms/{hosts} "
			+ $"({TestDbTimings._PerItem(host, hosts):0}ms each) "
			+ $"drop={drop.TotalMilliseconds:0}ms/{drops} "
			+ $"({TestDbTimings._PerItem(drop, drops):0}ms each) "
			+ $"total={(clone + host + drop).TotalMilliseconds:0}ms"
		);
	}

	private static double _PerItem(TimeSpan total, int count) {
		return count == 0 ? 0 : total.TotalMilliseconds / count;
	}
}
