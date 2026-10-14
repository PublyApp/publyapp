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
		this._CounterStore = counterStore;
		this._PolicyName = policyName;
		this._PartitionKey = partitionKey;
		this._PermitLimit = permitLimit;
		this._Window = window;
		this._LastAccessTimestamp =
			TimeProvider.System.GetTimestamp();
	}

	public override TimeSpan? IdleDuration {
		get {
			// Eligible for eviction one full window after the last access,
			// reported as time since that threshold passed.
			var lastAccess = Volatile.Read(ref this._LastAccessTimestamp);
			var elapsed = TimeProvider.System
				.GetElapsedTime(lastAccess);
			if (elapsed < this._Window) {
				return null;
			}

			return elapsed - this._Window;
		}
	}

	protected override RateLimitLease AttemptAcquireCore(
		int permitCount
	) {
		this._MarkAccess();
		if (permitCount > this._PermitLimit) {
			return new CounterLease(false, this._RemainingWindow());
		}

		var result = this._CounterStore
			.AcquireAsync(
				this._PolicyName,
				this._PartitionKey,
				this._PermitLimit,
				this._Window,
				permitCount,
				TimeProvider.System.GetUtcNow()
			)
			.GetAwaiter()
			.GetResult();
		return this._ToLease(result);
	}

	protected override async ValueTask<RateLimitLease>
		AcquireAsyncCore(
			int permitCount,
			CancellationToken cancellationToken
		) {
		this._MarkAccess();
		cancellationToken.ThrowIfCancellationRequested();
		if (permitCount > this._PermitLimit) {
			return new CounterLease(false, this._RemainingWindow());
		}

		var result = await this._CounterStore.AcquireAsync(
			this._PolicyName,
			this._PartitionKey,
			this._PermitLimit,
			this._Window,
			permitCount,
			TimeProvider.System.GetUtcNow()
		);
		return this._ToLease(result);
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
			: new CounterLease(false, this._RemainingWindow());
	}

	private TimeSpan _RemainingWindow() {
		var utcNow = TimeProvider.System.GetUtcNow();
		var ticksInWindow = this._Window.Ticks;
		var windowIndex = utcNow.UtcTicks / ticksInWindow;
		var windowStart = new DateTimeOffset(
			windowIndex * ticksInWindow,
			TimeSpan.Zero
		);
		var remaining = windowStart.Add(this._Window) - utcNow;
		return remaining > TimeSpan.Zero
			? remaining
			: TimeSpan.Zero;
	}

	private void _MarkAccess() {
		Interlocked.Exchange(
			ref this._LastAccessTimestamp,
			TimeProvider.System.GetTimestamp()
		);
	}

	private sealed class CounterLease : RateLimitLease {
		private readonly TimeSpan? _RetryAfter;

		public CounterLease(bool isAcquired, TimeSpan? retryAfter) {
			this.IsAcquired = isAcquired;
			this._RetryAfter = isAcquired ? null : retryAfter;
		}

		public override bool IsAcquired { get; }

		public override IEnumerable<string> MetadataNames {
			get {
				if (this._RetryAfter is not null) {
					yield return MetadataName.RetryAfter.Name;
				}
			}
		}

		public override bool TryGetMetadata(
			string metadataName,
			out object? metadata
		) {
			if (
				this._RetryAfter is not null
				&& metadataName == MetadataName.RetryAfter.Name
			) {
				metadata = this._RetryAfter.Value;
				return true;
			}

			metadata = null;
			return false;
		}
	}
}
