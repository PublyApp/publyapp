using System.Collections.Concurrent;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class RateLimitRejectionLogAggregator {
	private static readonly TimeSpan _LogInterval =
		TimeSpan.FromMinutes(1);
	private readonly ConcurrentDictionary<
		string,
		PolicyRejectionState
	> _PolicyStates = new(StringComparer.Ordinal);
	private readonly TimeProvider _TimeProvider;

	public RateLimitRejectionLogAggregator()
		: this(TimeProvider.System) {
	}

	internal RateLimitRejectionLogAggregator(
		TimeProvider timeProvider
	) {
		_TimeProvider = timeProvider;
	}

	public RateLimitRejectionLogEntry? Record(
		RateLimitRejectionInfo info
	) {
		var state = _PolicyStates.GetOrAdd(
			info.PolicyName,
			_ => new PolicyRejectionState()
		);

		lock (state) {
			state.RejectionCount++;
			var now = _TimeProvider.GetTimestamp();
			if (state.LastLogTimestamp is not null) {
				var elapsed = _TimeProvider.GetElapsedTime(
					state.LastLogTimestamp.Value,
					now
				);
				if (elapsed < _LogInterval) {
					return null;
				}
			}

			var entry = new RateLimitRejectionLogEntry(
				info.PolicyName,
				info.PartitionFingerprint,
				state.RejectionCount
			);
			state.RejectionCount = 0;
			state.LastLogTimestamp = now;
			return entry;
		}
	}

	private sealed class PolicyRejectionState {
		public long? LastLogTimestamp { get; set; }
		public long RejectionCount { get; set; }
	}
}

internal sealed record RateLimitRejectionLogEntry(
	string PolicyName,
	string LatestPartitionFingerprint,
	long RejectionCount
);
