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
	private readonly IRateLimitCounterStore _CounterStore;
	private readonly string _PolicyName;
	private readonly string _PartitionKey;
	private readonly int _PermitLimit;
	private readonly TimeSpan _Window;
	private long _LastAccessTimestamp;

	public CounterBackedFixedWindowRateLimiter(
		IRateLimitCounterStore counterStore,
		string policyName,
		string partitionKey,
		int permitLimit,
		TimeSpan window
	) {
		_CounterStore = counterStore;
		_PolicyName = policyName;
		_PartitionKey = partitionKey;
		_PermitLimit = permitLimit;
		_Window = window;
		_LastAccessTimestamp =
			TimeProvider.System.GetTimestamp();
	}

	public override TimeSpan? IdleDuration {
		get {
			// Eligible for eviction one full window after the last access,
			// reported as time since that threshold passed.
			var lastAccess = Volatile.Read(ref _LastAccessTimestamp);
			var elapsed = TimeProvider.System
				.GetElapsedTime(lastAccess);
			if (elapsed < _Window) {
				return null;
			}

			return elapsed - _Window;
		}
	}

	protected override RateLimitLease AttemptAcquireCore(
		int permitCount
	) {
		_MarkAccess();
		if (permitCount > _PermitLimit) {
			return new CounterLease(false, _RemainingWindow());
		}

		var result = _CounterStore
			.AcquireAsync(
				_PolicyName,
				_PartitionKey,
				_PermitLimit,
				_Window,
				permitCount,
				TimeProvider.System.GetUtcNow()
			)
			.GetAwaiter()
			.GetResult();
		return _ToLease(result);
	}

	protected override async ValueTask<RateLimitLease>
		AcquireAsyncCore(
			int permitCount,
			CancellationToken cancellationToken
		) {
		_MarkAccess();
		cancellationToken.ThrowIfCancellationRequested();
		if (permitCount > _PermitLimit) {
			return new CounterLease(false, _RemainingWindow());
		}

		var result = await _CounterStore.AcquireAsync(
			_PolicyName,
			_PartitionKey,
			_PermitLimit,
			_Window,
			permitCount,
			TimeProvider.System.GetUtcNow()
		);
		return _ToLease(result);
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

	private RateLimitLease _ToLease(CounterLeaseResult result) {
		return result.Acquired
			? new CounterLease(true, null)
			: new CounterLease(false, _RemainingWindow());
	}

	private TimeSpan _RemainingWindow() {
		var utcNow = TimeProvider.System.GetUtcNow();
		var ticksInWindow = _Window.Ticks;
		var windowIndex = utcNow.UtcTicks / ticksInWindow;
		var windowStart = new DateTimeOffset(
			windowIndex * ticksInWindow,
			TimeSpan.Zero
		);
		var remaining = windowStart.Add(_Window) - utcNow;
		return remaining > TimeSpan.Zero
			? remaining
			: TimeSpan.Zero;
	}

	private void _MarkAccess() {
		Interlocked.Exchange(
			ref _LastAccessTimestamp,
			TimeProvider.System.GetTimestamp()
		);
	}

	private sealed class CounterLease : RateLimitLease {
		private readonly TimeSpan? _RetryAfter;

		public CounterLease(bool isAcquired, TimeSpan? retryAfter) {
			IsAcquired = isAcquired;
			_RetryAfter = isAcquired ? null : retryAfter;
		}

		public override bool IsAcquired { get; }

		public override IEnumerable<string> MetadataNames {
			get {
				if (_RetryAfter is not null) {
					yield return MetadataName.RetryAfter.Name;
				}
			}
		}

		public override bool TryGetMetadata(
			string metadataName,
			out object? metadata
		) {
			if (
				_RetryAfter is not null
				&& metadataName == MetadataName.RetryAfter.Name
			) {
				metadata = _RetryAfter.Value;
				return true;
			}

			metadata = null;
			return false;
		}
	}
}
