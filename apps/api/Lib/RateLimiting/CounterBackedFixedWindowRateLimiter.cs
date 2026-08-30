using System.Threading.RateLimiting;

namespace PublyApp.Api.Lib.RateLimiting;

/// <summary>
/// Fixed-window limiter whose permit accounting lives in an
/// <see cref="IRateLimitCounterStore"/> instead of process memory (#953).
/// Semantics mirror <see cref="FixedWindowRateLimiter"/>: windows are aligned to
/// whole window multiples, a rejected acquisition consumes nothing, and requests
/// larger than the whole window are refused without touching the store. Failed
/// store acquisitions surface as failed leases carrying
/// <see cref="MetadataName.RetryAfter"/> set to the remaining window, so 429
/// responses keep their exact pre-#953 shape whatever the fail mode decided.
/// </summary>
internal sealed class CounterBackedFixedWindowRateLimiter
	: RateLimiter {
	private readonly IRateLimitCounterStore _counterStore;
	private readonly string _policyName;
	private readonly string _partitionKey;
	private readonly int _permitLimit;
	private readonly TimeSpan _window;
	private long _lastAccessTimestamp;

	public CounterBackedFixedWindowRateLimiter(
		IRateLimitCounterStore counterStore,
		string policyName,
		string partitionKey,
		int permitLimit,
		TimeSpan window
	) {
		_counterStore = counterStore;
		_policyName = policyName;
		_partitionKey = partitionKey;
		_permitLimit = permitLimit;
		_window = window;
		_lastAccessTimestamp =
			TimeProvider.System.GetTimestamp();
	}

	public override TimeSpan? IdleDuration {
		get {
			// Eligible for eviction one full window after the last access,
			// reported as time since that threshold passed.
			var lastAccess = Volatile.Read(ref _lastAccessTimestamp);
			var elapsed = TimeProvider.System
				.GetElapsedTime(lastAccess);
			if (elapsed < _window) {
				return null;
			}

			return elapsed - _window;
		}
	}

	protected override RateLimitLease AttemptAcquireCore(
		int permitCount
	) {
		MarkAccess();
		if (permitCount > _permitLimit) {
			return new CounterLease(false, RemainingWindow());
		}

		var result = _counterStore
			.AcquireAsync(
				_policyName,
				_partitionKey,
				_permitLimit,
				_window,
				permitCount,
				TimeProvider.System.GetUtcNow()
			)
			.GetAwaiter()
			.GetResult();
		return ToLease(result);
	}

	protected override async ValueTask<RateLimitLease>
		AcquireAsyncCore(
			int permitCount,
			CancellationToken cancellationToken
		) {
		MarkAccess();
		cancellationToken.ThrowIfCancellationRequested();
		if (permitCount > _permitLimit) {
			return new CounterLease(false, RemainingWindow());
		}

		var result = await _counterStore.AcquireAsync(
			_policyName,
			_partitionKey,
			_permitLimit,
			_window,
			permitCount,
			TimeProvider.System.GetUtcNow()
		);
		return ToLease(result);
	}

	protected override void Dispose(bool disposing) {
		// The singleton counter store outlives per-partition adapters;
		// partitions dispose only this shell.
	}

	public override RateLimiterStatistics? GetStatistics() {
		// Permit accounting lives in Postgres; no local statistics exist.
		return null;
	}

	protected override ValueTask DisposeAsyncCore() {
		return ValueTask.CompletedTask;
	}

	private RateLimitLease ToLease(CounterLeaseResult result) {
		return result.Acquired
			? new CounterLease(true, null)
			: new CounterLease(false, RemainingWindow());
	}

	private TimeSpan RemainingWindow() {
		var utcNow = TimeProvider.System.GetUtcNow();
		var ticksInWindow = _window.Ticks;
		var windowIndex = utcNow.UtcTicks / ticksInWindow;
		var windowStart = new DateTimeOffset(
			windowIndex * ticksInWindow,
			TimeSpan.Zero
		);
		var remaining = windowStart.Add(_window) - utcNow;
		return remaining > TimeSpan.Zero
			? remaining
			: TimeSpan.Zero;
	}

	private void MarkAccess() {
		Interlocked.Exchange(
			ref _lastAccessTimestamp,
			TimeProvider.System.GetTimestamp()
		);
	}

	private sealed class CounterLease : RateLimitLease {
		private readonly TimeSpan? _retryAfter;

		public CounterLease(bool isAcquired, TimeSpan? retryAfter) {
			IsAcquired = isAcquired;
			_retryAfter = isAcquired ? null : retryAfter;
		}

		public override bool IsAcquired { get; }

		public override IEnumerable<string> MetadataNames {
			get {
				if (_retryAfter is not null) {
					yield return MetadataName.RetryAfter.Name;
				}
			}
		}

		public override bool TryGetMetadata(
			string metadataName,
			out object? metadata
		) {
			if (
				_retryAfter is not null
				&& metadataName == MetadataName.RetryAfter.Name
			) {
				metadata = _retryAfter.Value;
				return true;
			}

			metadata = null;
			return false;
		}
	}
}
