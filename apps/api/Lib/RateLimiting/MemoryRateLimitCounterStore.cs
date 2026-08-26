using System.Collections.Concurrent;

namespace PublyApp.Api.Lib.RateLimiting;

/// <summary>
/// Process-local fixed-window counters: the pre-#953 behavior preserved behind
/// the shared interface. Selected explicitly with RATE_LIMIT_COUNTER_STORE=memory
/// (the documented incident lever); never fails the store, so every acquisition
/// reflects a real local decision regardless of fail modes.
/// </summary>
internal sealed class MemoryRateLimitCounterStore
	: IRateLimitCounterStore {
	private readonly ConcurrentDictionary<
		string,
		WindowState
	> _windows = new(StringComparer.Ordinal);

	public Task<CounterLeaseResult> AcquireAsync(
		string policyName,
		string partitionKey,
		int permitLimit,
		TimeSpan window,
		int permitCount,
		DateTimeOffset utcNow
	) {
		var windowStartedAt =
			PostgresRateLimitCounterStore.GetWindowStart(
				utcNow,
				window
			);
		var state = _windows.GetOrAdd(
			$"{policyName}\n{partitionKey}",
			_ => new WindowState()
		);

		lock (state) {
			if (state.WindowStartedAt != windowStartedAt) {
				state.WindowStartedAt = windowStartedAt;
				state.PermitCount = 0;
			}

			var newPermitCount =
				state.PermitCount + permitCount;
			if (newPermitCount > permitLimit) {
				return Task.FromResult(
					CounterLeaseResult.Rejected()
				);
			}

			state.PermitCount = newPermitCount;
			return Task.FromResult(
				CounterLeaseResult.Granted(newPermitCount)
			);
		}
	}

	public ValueTask DisposeAsync() {
		_windows.Clear();
		return ValueTask.CompletedTask;
	}

	private sealed class WindowState {
		public DateTimeOffset WindowStartedAt { get; set; }
		public long PermitCount { get; set; }
	}
}
