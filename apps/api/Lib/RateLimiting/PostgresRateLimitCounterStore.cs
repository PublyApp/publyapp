using System.Data;
using System.Security.Cryptography;
using System.Text;

using Microsoft.EntityFrameworkCore;

using Npgsql;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Lib.RateLimiting;

/// <summary>
/// Postgres-backed fixed-window counters (#953). Every acquisition is one atomic
/// conditional UPSERT on a row keyed by (policy_name, partition_key_hash,
/// window_started_at); the row-level lock on the conflicting tuple serialises
/// concurrent replicas, so N processes share exactly one budget per partition and
/// over-admission is impossible by construction — the same argument the upload
/// byte budgets use (<c>upload_budgets</c>, #807). Connections are borrowed from
/// the scoped <see cref="AppDbContext"/> (never from POSTGRES_CONNECTION_STRING
/// directly) so integration-test hosts automatically see their per-class test
/// database.
///
/// Failure handling: five consecutive store failures open a circuit breaker for
/// 30 s; while open, acquisitions do not dial Postgres at all (no timeout
/// amplification during an outage); after the cooldown a single probe request is
/// let through (half-open): a success closes the breaker, a failure re-opens it
/// immediately. Every failed acquisition applies its policy's fail mode —
/// <see cref="CounterFailModes.MustFailClosed"/> policies reject, the rest admit.
///
/// Housekeeping: touching a key deletes that key's superseded window rows; a
/// process-wide sweep runs at most once per minute and deletes rows older than
/// the largest configured window. No hosted service, no Quartz job.
/// </summary>
internal sealed partial class PostgresRateLimitCounterStore
	: IRateLimitCounterStore {
	private const int CommandTimeoutSeconds = 5;
	internal const int BreakerFailureThreshold = 5;
	internal static readonly TimeSpan BreakerCooldown =
		TimeSpan.FromSeconds(30);
	internal static readonly TimeSpan SweepInterval =
		TimeSpan.FromMinutes(1);

	private enum BreakerState {
		Closed,
		Open,
		HalfOpen,
	}

	private readonly IServiceScopeFactory _scopeFactory;
	private readonly TimeProvider _timeProvider;
	private readonly ILogger<PostgresRateLimitCounterStore> _logger;
	private readonly TimeSpan _maxWindow;

	private readonly object _guard = new();
	private BreakerState _breakerState = BreakerState.Closed;
	private int _consecutiveFailures;
	private DateTimeOffset _breakerOpenedAt;
	private DateTimeOffset _lastSweepAt;

	public PostgresRateLimitCounterStore(
		IServiceScopeFactory scopeFactory,
		ILogger<PostgresRateLimitCounterStore> logger,
		ApiRateLimitSettings apiSettings,
		AnonymousAuthRateLimitSettings anonymousAuthSettings,
		TimeProvider? timeProvider = null
	) {
		_scopeFactory = scopeFactory;
		_timeProvider = timeProvider ?? TimeProvider.System;
		_logger = logger;
		_maxWindow = Enumerable
			.Empty<TimeSpan>()
			.Append(TimeSpan.FromSeconds(apiSettings.Global.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.AnonymousOther.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.Authenticated.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.HeavySearch.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.Bulk.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.TenantBulk.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.Email.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.TenantEmail.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.Export.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.TenantExport.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.Upload.WindowSeconds))
			.Append(TimeSpan.FromSeconds(apiSettings.SocialConnect.WindowSeconds))
			.Append(TimeSpan.FromSeconds(anonymousAuthSettings.PerIp.WindowSeconds))
			.Append(TimeSpan.FromSeconds(anonymousAuthSettings.PerEmail.WindowSeconds))
			.Append(TimeSpan.FromSeconds(
				anonymousAuthSettings.PasswordResetPerEmail.WindowSeconds
			))
			.Max();
	}

	public async Task<CounterLeaseResult> AcquireAsync(
		string policyName,
		string partitionKey,
		int permitLimit,
		TimeSpan window,
		int permitCount,
		DateTimeOffset utcNow
	) {
		if (!TryEnterClosedBreaker()) {
			return ApplyFailMode(policyName);
		}

		var windowStartedAt = GetWindowStart(utcNow, window);

		try {
			await using var scope = _scopeFactory.CreateAsyncScope();
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();
			// Borrow only the scoped context's connection (test hosts override its
			// provider); every command auto-commits so the accounting UPSERT persists
			// immediately — a wrapping transaction would let a later rollback undo
			// permits other replicas already observed.
			var connection =
				(NpgsqlConnection)dbContext.Database.GetDbConnection();
			if (connection.State != ConnectionState.Open) {
				await connection.OpenAsync();
			}

			var newPermitCount = await UpsertCounterAsync(
				connection,
				policyName,
				partitionKey,
				windowStartedAt,
				permitCount,
				permitLimit
			);

			await DeleteSupersededWindowsAsync(
				connection,
				policyName,
				partitionKey,
				windowStartedAt
			);
			await MaybeSweepExpiredAsync(connection, utcNow);

			RecordSuccess();
			return newPermitCount is not null
				? CounterLeaseResult.Granted(newPermitCount.Value)
				: CounterLeaseResult.Rejected();
		} catch (Exception exception) when (
			exception is NpgsqlException
				or DbUpdateException
				or InvalidOperationException
		) {
			RecordFailure();
			LogAcquisitionFailed(exception, policyName);
			return ApplyFailMode(policyName);
		}
	}

	public ValueTask DisposeAsync() {
		return ValueTask.CompletedTask;
	}

	/// <summary>
	/// Aligns the timestamp down to a whole multiple of the window length, giving
	/// every replica the identical window start for rollover without shared clocks
	/// beyond normal NTP.
	/// </summary>
	internal static DateTimeOffset GetWindowStart(
		DateTimeOffset utcNow,
		TimeSpan window
	) {
		var ticksInWindow = window.Ticks;
		var windowIndex = utcNow.UtcTicks / ticksInWindow;
		return new DateTimeOffset(
			windowIndex * ticksInWindow,
			TimeSpan.Zero
		);
	}

	/// <summary>
	/// Partition keys embed resolved client IPs, normalised emails, session-ID
	/// fingerprints and tenant IDs; they are stored only as truncated SHA-256
	/// hashes so the table never becomes a PII side-channel (same stance as the
	/// throttle logs).
	/// </summary>
	internal static string HashPartitionKey(string partitionKey) {
		var hash = SHA256.HashData(
			Encoding.UTF8.GetBytes(partitionKey)
		);
		return Convert.ToHexString(hash)[..32];
	}

	private static async Task<long?> UpsertCounterAsync(
		NpgsqlConnection connection,
		string policyName,
		string partitionKey,
		DateTimeOffset windowStartedAt,
		int permitCount,
		int permitLimit
	) {
		await using var command = connection.CreateCommand();
		command.CommandTimeout = CommandTimeoutSeconds;
		command.CommandText = """
			INSERT INTO rate_limit_counters
				(policy_name, partition_key_hash, window_started_at, permit_count)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (policy_name, partition_key_hash, window_started_at) DO UPDATE
				SET permit_count = rate_limit_counters.permit_count + EXCLUDED.permit_count
				WHERE rate_limit_counters.permit_count + EXCLUDED.permit_count <= $5
			RETURNING permit_count
			""";
		AddParameter(command, policyName);
		AddParameter(command, HashPartitionKey(partitionKey));
		AddParameter(command, windowStartedAt.UtcDateTime);
		AddParameter(command, (long)permitCount);
		AddParameter(command, (long)permitLimit);

		var result = await command.ExecuteScalarAsync();
		return result is long count ? count : null;
	}

	private static void AddParameter(
		NpgsqlCommand command,
		object value
	) {
		var parameter = command.CreateParameter();
		parameter.Value = value;
		command.Parameters.Add(parameter);
	}

	private static async Task DeleteSupersededWindowsAsync(
		NpgsqlConnection connection,
		string policyName,
		string partitionKey,
		DateTimeOffset currentWindowStart
	) {
		await using var command = connection.CreateCommand();
		command.CommandTimeout = CommandTimeoutSeconds;
		command.CommandText = """
			DELETE FROM rate_limit_counters
			WHERE policy_name = $1
				AND partition_key_hash = $2
				AND window_started_at < $3
			""";
		AddParameter(command, policyName);
		AddParameter(command, HashPartitionKey(partitionKey));
		AddParameter(command, currentWindowStart.UtcDateTime);

		await command.ExecuteNonQueryAsync();
	}

	private async Task MaybeSweepExpiredAsync(
		NpgsqlConnection connection,
		DateTimeOffset utcNow
	) {
		lock (_guard) {
			if (
				_lastSweepAt != default
				&& utcNow - _lastSweepAt < SweepInterval
			) {
				return;
			}

			_lastSweepAt = utcNow;
		}

		try {
			await using var command = connection.CreateCommand();
			command.CommandTimeout = CommandTimeoutSeconds;
			command.CommandText = """
				DELETE FROM rate_limit_counters
				WHERE window_started_at < $1
				""";
			AddParameter(command, utcNow.UtcDateTime - _maxWindow);

			await command.ExecuteNonQueryAsync();
		} catch (Exception exception) when (
			exception is NpgsqlException or InvalidOperationException
		) {
			// The acquisition itself succeeded; a lapsed-housekeeping miss must not
			// flip the breaker or fail the request. The next sweep retries.
			LogSweepFailed(exception);
		}
	}

	private static CounterLeaseResult ApplyFailMode(string policyName) {
		return CounterFailModes.MustFailClosed(policyName)
			? CounterLeaseResult.Rejected()
			: CounterLeaseResult.FailedStore();
	}

	private bool TryEnterClosedBreaker() {
		lock (_guard) {
			switch (_breakerState) {
				case BreakerState.Closed:
					return true;
				case BreakerState.HalfOpen:
					// One probe at a time; everyone else rides the fail modes.
					return false;
				case BreakerState.Open:
				default:
					break;
			}

			if (
				_timeProvider.GetUtcNow() - _breakerOpenedAt
				< BreakerCooldown
			) {
				return false;
			}

			_breakerState = BreakerState.HalfOpen;
			LogBreakerProbing();
			return true;
		}
	}

	private void RecordSuccess() {
		lock (_guard) {
			_breakerState = BreakerState.Closed;
			_consecutiveFailures = 0;
		}
	}

	private void RecordFailure() {
		lock (_guard) {
			_consecutiveFailures++;
			if (
				_breakerState == BreakerState.HalfOpen
				|| _consecutiveFailures >= BreakerFailureThreshold
			) {
				_breakerState = BreakerState.Open;
				_breakerOpenedAt = _timeProvider.GetUtcNow();
				LogBreakerOpened(
					_consecutiveFailures,
					(int)BreakerCooldown.TotalSeconds
				);
			}
		}
	}

	[LoggerMessage(
		Level = LogLevel.Error,
		Message = "Rate-limit counter store acquisition failed; applying policy fail mode for {PolicyName}"
	)]
	private partial void LogAcquisitionFailed(
		Exception exception,
		string policyName
	);

	[LoggerMessage(
		Level = LogLevel.Warning,
		Message = "Rate-limit counter store circuit breaker opened after {FailureCount} consecutive failures; acquisitions stop dialling Postgres for {CooldownSeconds}s"
	)]
	private partial void LogBreakerOpened(
		int failureCount,
		int cooldownSeconds
	);

	[LoggerMessage(
		Level = LogLevel.Information,
		Message = "Rate-limit counter store breaker cooldown elapsed; probing with one request"
	)]
	private partial void LogBreakerProbing();

	[LoggerMessage(
		Level = LogLevel.Warning,
		Message = "Rate-limit counter store housekeeping sweep failed; will retry next interval"
	)]
	private partial void LogSweepFailed(Exception exception);
}
