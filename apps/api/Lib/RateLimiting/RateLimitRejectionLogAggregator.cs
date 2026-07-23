using System.Collections.Concurrent;

namespace PublyApp.Api.Lib.RateLimiting;

internal sealed class RateLimitRejectionLogAggregator {
	private static readonly TimeSpan LogInterval =
		TimeSpan.FromMinutes(1);
	private readonly ConcurrentDictionary<
		string,
		PolicyRejectionState
	> _policyStates = new(StringComparer.Ordinal);
	private readonly TimeProvider _timeProvider;

	public RateLimitRejectionLogAggregator()
		: this(TimeProvider.System) {
	}

	internal RateLimitRejectionLogAggregator(
		TimeProvider timeProvider
	) {
		_timeProvider = timeProvider;
	}

	public RateLimitRejectionLogEntry? Record(
		RateLimitRejectionInfo info
	) {
		var state = _policyStates.GetOrAdd(
			info.PolicyName,
			_ => new PolicyRejectionState()
		);

		lock (state) {
			state.RejectionCount++;
			var now = _timeProvider.GetTimestamp();
			if (state.LastLogTimestamp is not null) {
				var elapsed = _timeProvider.GetElapsedTime(
					state.LastLogTimestamp.Value,
					now
				);
				if (elapsed < LogInterval) {
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
