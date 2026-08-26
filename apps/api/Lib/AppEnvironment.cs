using System.Globalization;
using System.Net;

using FluentValidation;

using Npgsql;

namespace PublyApp.Api.Lib;

/// <summary>
/// Provides access to environment variables with validation.
/// Call Initialize() once at startup before accessing properties.
/// </summary>
public class AppEnvironment {
	internal const long DefaultUploadGlobalMaxBytes = 1_073_741_824;
	internal const long DefaultUploadPerStaffMaxBytes = 104_857_600;

	// Static accessor for use outside DI
	private static AppEnvironment? _instance;
	private static readonly Lock InitLock = new();

	/// <summary>
	/// Gets the initialized instance. Throws if Initialize() hasn't been called.
	/// </summary>
	public static AppEnvironment Instance {
		get {
			var instance = Volatile.Read(ref _instance);
			if (instance is null) {
				throw new InvalidOperationException(
					"AppEnvironment not initialized. "
					+ "Call AppEnvironment.Initialize() "
					+ "first."
				);
			}
			return instance;
		}
	}

	// ========== Environment Variables (secrets, URLs) ==========
	public string POSTGRES_CONNECTION_STRING { get; }
	public string FRONT_URL { get; }
	public string RESEND_API_KEY { get; }
	public string STAFF_OWNER_EMAIL { get; }
	public string STAFF_OWNER_BOOTSTRAP_CODE { get; }
	public byte[] SocialAccountsMasterKey { get; }

	// ========== App Settings (moved from appsettings.json) ==========
	public string APP_NAME { get; }
	public string DEFAULT_EMAIL_SENDER_EMAIL { get; }
	public string DEFAULT_EMAIL_SENDER_NAME { get; }
	public string SESSION_TOKEN_HEADER_KEY { get; }
	public string TENANT_ID_HEADER_KEY { get; }
	public int SESSION_EXPIRY_DAYS { get; }
	public int EMAIL_VERIFY_TOKEN_VALIDITY_DURATION { get; }
	public int PASSWORD_RESET_TOKEN_VALIDITY_DURATION { get; }
	public int PASSWORD_MIN_LENGTH { get; }
	public int EMAIL_VERIFY_TOKEN_LENGTH { get; }
	public int PASSWORD_RESET_TOKEN_LENGTH { get; }
	public int INVITATION_TOKEN_LENGTH { get; }
	public bool DI_MANIFEST_ENABLED { get; }
	public int AUDIT_LOG_EXPORT_MAX_ROWS { get; }
	public int MAX_PROFILES_PER_USER { get; }
	public int TENANT_USER_EXPORT_MAX_ROWS { get; }
	public int TENANT_ACTIVITY_THROTTLE_MINUTES { get; }
	public string FILE_STORAGE_ROOT { get; }
	public int UPLOAD_MAX_BYTES { get; }
	public long UPLOAD_GLOBAL_MAX_BYTES { get; }
	public long UPLOAD_PER_STAFF_MAX_BYTES { get; }
	/// <summary>Grace period (days) an orphaned upload must age past before the
	/// sweeper may physically delete its blob (owner rule: deferred deletion with a
	/// final recheck, never inline deletes).</summary>
	public int UPLOAD_ORPHAN_GRACE_DAYS { get; }
	/// <summary>TTL (minutes) after which a <c>Reserved</c> upload-asset row is
	/// considered abandoned by a crashed writer; the sweeper then hard-deletes the
	/// row and releases its held reservation bytes.</summary>
	public int UPLOAD_STALE_RESERVATION_TTL_MINUTES { get; }
	/// <summary>Retention TTL (minutes) for <c>Stored</c> rows nobody references
	/// (the fail-soft "blob MAY exist" path); the sweeper may then remove the blob
	/// and reclaim their committed bytes.</summary>
	public int UPLOAD_STORED_ORPHAN_TTL_MINUTES { get; }
	public IReadOnlyList<string> TRUSTED_PROXY_CIDRS { get; }
	public int ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int ANON_AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int GLOBAL_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int GLOBAL_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int ANONYMOUS_OTHER_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int ANONYMOUS_OTHER_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int AUTHENTICATED_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int HEAVY_SEARCH_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int HEAVY_SEARCH_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int BULK_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int BULK_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int TENANT_BULK_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int TENANT_BULK_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int EMAIL_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int EMAIL_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int TENANT_EMAIL_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int TENANT_EMAIL_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int EXPORT_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int EXPORT_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int TENANT_EXPORT_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int TENANT_EXPORT_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int UPLOAD_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int UPLOAD_RATE_LIMIT_WINDOW_SECONDS { get; }
	public int SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT { get; }
	public int SOCIAL_CONNECT_RATE_LIMIT_WINDOW_SECONDS { get; }

	// Distributed rate limiting (#953): which store backs the shared fixed-window
	// counters. 'postgres' (default) makes N replicas share one budget per
	// partition; 'memory' restores per-process counting for incident triage.
	public string RATE_LIMIT_COUNTER_STORE { get; }

	// ========== Hosting role + worker tuning (design §3.1) ==========
	// APP_ROLE picks the composition root. It is optional ONLY in the Development and
	// Testing host environments, where it defaults to AppRole.All (both HTTP surface and
	// job engine) so local dev and the worker integration fixtures need no extra config.
	//
	// In EVERY other host environment — Production, Staging, or an unset
	// ASPNETCORE_ENVIRONMENT/DOTNET_ENVIRONMENT, which GetHostEnvironmentName resolves to
	// Production — a missing or blank APP_ROLE is a fail-fast startup error (C6/F24).
	// `All` composes the job engine into the process, so inheriting it by omission would
	// silently run the worker surface inside a container an operator intended as
	// API-only, double-claiming queue rows against the real worker. `All` is therefore
	// only ever an explicit local-dev or fixture choice, never a production fallback.
	//
	// Consequence for tooling: every non-dev entrypoint that boots the app must pin
	// APP_ROLE explicitly — including `dotnet build` (it runs the app to emit the OpenAPI
	// document) and the Dockerfile's migrate stage. See the enumerated list in §3.1.
	public AppRole Role { get; }

	// Rows a JobQueueProcessor tick claims (matches the shipped outbox BatchSize).
	public int JOB_QUEUE_BATCH_SIZE { get; }
	// Fallback poll interval for the processor loop, in seconds.
	public int JOB_QUEUE_POLL_SECONDS { get; }
	// Claim lease / renewal target / stale-reclaim cutoff, in seconds.
	public int JOB_LEASE_SECONDS { get; }
	// Max continuous drain per wake before the processor yields one loop iteration
	// (design §3.1, F10; consumed by 2A-R's drain loop).
	public int JOB_QUEUE_DRAIN_BUDGET_SECONDS { get; }
	// Retention sweep window for email_log rows (design §3.1, F20/O7; consumed by the
	// Phase-3 retention system jobs).
	public int EMAIL_LOG_RETENTION_DAYS { get; }
	// Retention sweep window for job_dead_letter rows (design §3.1, F20/O7).
	public int JOB_DEAD_LETTER_RETENTION_DAYS { get; }
	// Sensitive prepared-byte lifetime and email-DLQ requeue window, in days
	// (design §3.1/§4.2/§4.5/§7.3, O7/O16/R2-11/R4-3).
	public int EMAIL_PREPARED_SEND_RETENTION_DAYS { get; }
	// OBSERVABILITY THRESHOLD ONLY, not a deletion guarantee (design §3.1/§7.2, R10-2):
	// the overdue age at which jobs.prepared_state.sweep_overdue warns. Nothing deletes
	// bytes because this elapses — it exists so the gap between *eligible* and *deleted*
	// is visible and alertable.
	public int EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES { get; }
	// Prune window for the system_job_occurrences ledger, in days
	// (design §3.1/§4.3/§7.3, O9).
	public int SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS { get; }
	// Prune window for job_alert_delivery_leases audit rows, in days
	// (design §3.1/§7.2/§7.3, O7/R5-3).
	public int JOB_ALERT_LEASE_RETENTION_DAYS { get; }
	// Exact job_type strings tolerated as historical orphans in job_dead_letter ONLY
	// (design §3.1/§5.4, R2-9): DLQ rows whose handler is legitimately retired and which
	// will never be requeued. It is NOT a global bypass — an unregistered job_type in
	// job_queue is never tolerated, and wildcards are rejected (the validator enforces
	// exact types). Empty by default; the startup gate audit-logs each entry at boot.
	public IReadOnlyList<string> JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST { get; }

	// Maps the HTTP request surface (endpoints + middleware). Computed the same way
	// as the IsDevelopment accessors: `api` and `all` serve HTTP, `worker` does not.
	public bool IsApiRole {
		get { return Role is AppRole.Api or AppRole.All; }
	}

	// Runs the worker-only job hosted-services. `worker` and `all` run the engine,
	// `api` does not.
	public bool IsWorkerRole {
		get { return Role is AppRole.Worker or AppRole.All; }
	}

	// ========== Constants (hardcoded, not from environment) ==========
#pragma warning disable CA1822
	public int PAGINATION_DEFAULT_LIMIT {
		get {
			return 100;
		}
	}

	// Must stay in sync with the largest front-end page size —
	// PAGE_SIZE_OPTIONS / MAX_TABLE_SIZE in
	// apps/front/src/lib/url-state/table-search-params.ts.
	// Caps caller-supplied `limit` so a request can't force the API to
	// materialise an unbounded number of rows.
	public int PAGINATION_MAX_LIMIT {
		get {
			return 100;
		}
	}

	public int MAX_BULK_INVITATIONS_SIZE {
		get {
			return 1000;
		}
	}

	public int DEFAULT_MAX_USERS_PER_TENANT {
		get {
			return 5;
		}
	}

	// ========== Computed properties ==========
	public static bool IsDevelopment {
		get {
			return string.Equals(
		GetHostEnvironmentName(),
		EnvironmentNames.Development,
		StringComparison.OrdinalIgnoreCase
	);
		}
	}

	public static bool IsProduction {
		get {
			return string.Equals(
		GetHostEnvironmentName(),
		EnvironmentNames.Production,
		StringComparison.OrdinalIgnoreCase
	);
		}
	}

	public static bool IsTesting {
		get {
			return string.Equals(
		GetHostEnvironmentName(),
		EnvironmentNames.Testing,
		StringComparison.OrdinalIgnoreCase
	);
		}
	}

	// Round-1 fix (#1319): single source of truth for the hosting-environment policy of
	// test-only machinery (currently the #1309/#1319 boot-log probe). Such machinery is
	// honoured ONLY when the host environment resolves to Development or Testing;
	// Production, Staging, or an UNSET host environment (what a bare container gets)
	// refuses — fail closed.
	public static bool IsProbeAllowedHostEnvironment() {
		var name = GetHostEnvironmentName();
		return string.Equals(
				name,
				EnvironmentNames.Development,
				StringComparison.OrdinalIgnoreCase
			)
			|| string.Equals(
				name,
				EnvironmentNames.Testing,
				StringComparison.OrdinalIgnoreCase
			);
	}

	// Resolves the host environment name WITHOUT the Production fallback, so callers can
	// distinguish "resolved to X" from "nothing is set" (bare container). Mirrors
	// GetHostEnvironmentName()'s precedence: ASPNETCORE_ENVIRONMENT first, then
	// DOTNET_ENVIRONMENT. Blank values count as unset — an empty variable must never be
	// reported as a resolved environment name.
	public static bool TryGetHostEnvironmentName(out string name) {
		var aspNetCoreValue =
			Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
		if (!string.IsNullOrWhiteSpace(aspNetCoreValue)) {
			name = aspNetCoreValue;
			return true;
		}

		var dotNetValue = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
		if (!string.IsNullOrWhiteSpace(dotNetValue)) {
			name = dotNetValue;
			return true;
		}

		name = "";
		return false;
	}

	public static bool IsTestVerboseLoggingEnabled {
		get {
			var value = Environment.GetEnvironmentVariable(
				"TEST_VERBOSE_LOGS"
			);

			if (string.IsNullOrWhiteSpace(value)) {
				return false;
			}

			var trimmed = value.Trim();
			return trimmed == "1"
				|| trimmed.Equals(
					"true",
					StringComparison.OrdinalIgnoreCase
				);
		}
	}

	public static string EnvironmentName {
		get {
			return GetHostEnvironmentName();
		}
	}
#pragma warning restore CA1822

	// Private constructor - use Initialize()
	private AppEnvironment(
		// Environment variables
		string postgresConnectionString,
		string frontUrl,
		string resendApiKey,
		string staffOwnerEmail,
		string staffOwnerBootstrapCode,
		string socialAccountsMasterKey,
		// App settings
		string appName,
		string defaultEmailSenderEmail,
		string defaultEmailSenderName,
		string sessionTokenHeaderKey,
		string tenantIdHeaderKey,
		int sessionExpiryDays,
		int emailVerifyTokenValidityDuration,
		int passwordResetTokenValidityDuration,
		int passwordMinLength,
		int emailVerifyTokenLength,
		int passwordResetTokenLength,
		int invitationTokenLength,
		bool diManifestEnabled,
		int auditLogExportMaxRows,
		int maxProfilesPerUser,
		int tenantUserExportMaxRows,
		int tenantActivityThrottleMinutes,
		string fileStorageRoot,
		int uploadMaxBytes,
		long uploadGlobalMaxBytes,
		long uploadPerStaffMaxBytes,
		int uploadOrphanGraceDays,
		int uploadStaleReservationTtlMinutes,
		int uploadStoredOrphanTtlMinutes,
		IReadOnlyList<string> trustedProxyCidrs,
		int anonAuthIpRateLimitPermitLimit,
		int anonAuthIpRateLimitWindowSeconds,
		int anonAuthEmailRateLimitPermitLimit,
		int anonAuthEmailRateLimitWindowSeconds,
		int passwordResetEmailRateLimitPermitLimit,
		int passwordResetEmailRateLimitWindowSeconds,
		int globalRateLimitPermitLimit,
		int globalRateLimitWindowSeconds,
		int anonymousOtherRateLimitPermitLimit,
		int anonymousOtherRateLimitWindowSeconds,
		int authenticatedRateLimitPermitLimit,
		int authenticatedRateLimitWindowSeconds,
		int heavySearchRateLimitPermitLimit,
		int heavySearchRateLimitWindowSeconds,
		int bulkRateLimitPermitLimit,
		int bulkRateLimitWindowSeconds,
		int tenantBulkRateLimitPermitLimit,
		int tenantBulkRateLimitWindowSeconds,
		int emailRateLimitPermitLimit,
		int emailRateLimitWindowSeconds,
		int tenantEmailRateLimitPermitLimit,
		int tenantEmailRateLimitWindowSeconds,
		int exportRateLimitPermitLimit,
		int exportRateLimitWindowSeconds,
		int tenantExportRateLimitPermitLimit,
		int tenantExportRateLimitWindowSeconds,
		int uploadRateLimitPermitLimit,
		int uploadRateLimitWindowSeconds,
		int socialConnectRateLimitPermitLimit,
		int socialConnectRateLimitWindowSeconds,
		// Optional app setting (defaults to "postgres") — see RATE_LIMIT_COUNTER_STORE.
		string rateLimitCounterStore,
		AppRole role,
		int jobQueueBatchSize,
		int jobQueuePollSeconds,
		int jobLeaseSeconds,
		int jobQueueDrainBudgetSeconds,
		int emailLogRetentionDays,
		int jobDeadLetterRetentionDays,
		int emailPreparedSendRetentionDays,
		int emailPreparedSweepMaxLagMinutes,
		int systemJobOccurrenceRetentionDays,
		int jobAlertLeaseRetentionDays,
		IReadOnlyList<string> jobRegistryDlqOrphanAllowlist
	) {
		POSTGRES_CONNECTION_STRING = postgresConnectionString;
		FRONT_URL = frontUrl;
		RESEND_API_KEY = resendApiKey;
		STAFF_OWNER_EMAIL = staffOwnerEmail;
		STAFF_OWNER_BOOTSTRAP_CODE = staffOwnerBootstrapCode;
		SocialAccountsMasterKey = ParseMasterKey("SOCIAL_ACCOUNTS_MASTER_KEY", socialAccountsMasterKey);
		APP_NAME = appName;
		DEFAULT_EMAIL_SENDER_EMAIL = defaultEmailSenderEmail;
		DEFAULT_EMAIL_SENDER_NAME = defaultEmailSenderName;
		SESSION_TOKEN_HEADER_KEY = sessionTokenHeaderKey;
		TENANT_ID_HEADER_KEY = tenantIdHeaderKey;
		SESSION_EXPIRY_DAYS = sessionExpiryDays;
		EMAIL_VERIFY_TOKEN_VALIDITY_DURATION = emailVerifyTokenValidityDuration;
		PASSWORD_RESET_TOKEN_VALIDITY_DURATION = passwordResetTokenValidityDuration;
		PASSWORD_MIN_LENGTH = passwordMinLength;
		EMAIL_VERIFY_TOKEN_LENGTH = emailVerifyTokenLength;
		PASSWORD_RESET_TOKEN_LENGTH = passwordResetTokenLength;
		INVITATION_TOKEN_LENGTH = invitationTokenLength;
		DI_MANIFEST_ENABLED = diManifestEnabled;
		AUDIT_LOG_EXPORT_MAX_ROWS = auditLogExportMaxRows;
		MAX_PROFILES_PER_USER = maxProfilesPerUser;
		TENANT_USER_EXPORT_MAX_ROWS = tenantUserExportMaxRows;
		TENANT_ACTIVITY_THROTTLE_MINUTES = tenantActivityThrottleMinutes;
		FILE_STORAGE_ROOT = fileStorageRoot;
		UPLOAD_MAX_BYTES = uploadMaxBytes;
		UPLOAD_GLOBAL_MAX_BYTES = uploadGlobalMaxBytes;
		UPLOAD_PER_STAFF_MAX_BYTES = uploadPerStaffMaxBytes;
		UPLOAD_ORPHAN_GRACE_DAYS = uploadOrphanGraceDays;
		UPLOAD_STALE_RESERVATION_TTL_MINUTES = uploadStaleReservationTtlMinutes;
		UPLOAD_STORED_ORPHAN_TTL_MINUTES = uploadStoredOrphanTtlMinutes;
		TRUSTED_PROXY_CIDRS = trustedProxyCidrs;
		ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT = anonAuthIpRateLimitPermitLimit;
		ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS = anonAuthIpRateLimitWindowSeconds;
		ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT = anonAuthEmailRateLimitPermitLimit;
		ANON_AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS = anonAuthEmailRateLimitWindowSeconds;
		PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT =
			passwordResetEmailRateLimitPermitLimit;
		PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS =
			passwordResetEmailRateLimitWindowSeconds;
		GLOBAL_RATE_LIMIT_PERMIT_LIMIT = globalRateLimitPermitLimit;
		GLOBAL_RATE_LIMIT_WINDOW_SECONDS = globalRateLimitWindowSeconds;
		ANONYMOUS_OTHER_RATE_LIMIT_PERMIT_LIMIT =
			anonymousOtherRateLimitPermitLimit;
		ANONYMOUS_OTHER_RATE_LIMIT_WINDOW_SECONDS =
			anonymousOtherRateLimitWindowSeconds;
		AUTHENTICATED_RATE_LIMIT_PERMIT_LIMIT =
			authenticatedRateLimitPermitLimit;
		AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS =
			authenticatedRateLimitWindowSeconds;
		HEAVY_SEARCH_RATE_LIMIT_PERMIT_LIMIT =
			heavySearchRateLimitPermitLimit;
		HEAVY_SEARCH_RATE_LIMIT_WINDOW_SECONDS =
			heavySearchRateLimitWindowSeconds;
		BULK_RATE_LIMIT_PERMIT_LIMIT = bulkRateLimitPermitLimit;
		BULK_RATE_LIMIT_WINDOW_SECONDS = bulkRateLimitWindowSeconds;
		TENANT_BULK_RATE_LIMIT_PERMIT_LIMIT =
			tenantBulkRateLimitPermitLimit;
		TENANT_BULK_RATE_LIMIT_WINDOW_SECONDS =
			tenantBulkRateLimitWindowSeconds;
		EMAIL_RATE_LIMIT_PERMIT_LIMIT = emailRateLimitPermitLimit;
		EMAIL_RATE_LIMIT_WINDOW_SECONDS = emailRateLimitWindowSeconds;
		TENANT_EMAIL_RATE_LIMIT_PERMIT_LIMIT =
			tenantEmailRateLimitPermitLimit;
		TENANT_EMAIL_RATE_LIMIT_WINDOW_SECONDS =
			tenantEmailRateLimitWindowSeconds;
		EXPORT_RATE_LIMIT_PERMIT_LIMIT = exportRateLimitPermitLimit;
		EXPORT_RATE_LIMIT_WINDOW_SECONDS = exportRateLimitWindowSeconds;
		TENANT_EXPORT_RATE_LIMIT_PERMIT_LIMIT =
			tenantExportRateLimitPermitLimit;
		TENANT_EXPORT_RATE_LIMIT_WINDOW_SECONDS =
			tenantExportRateLimitWindowSeconds;
		UPLOAD_RATE_LIMIT_PERMIT_LIMIT = uploadRateLimitPermitLimit;
		UPLOAD_RATE_LIMIT_WINDOW_SECONDS = uploadRateLimitWindowSeconds;
		SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT =
			socialConnectRateLimitPermitLimit;
		SOCIAL_CONNECT_RATE_LIMIT_WINDOW_SECONDS =
			socialConnectRateLimitWindowSeconds;
		RATE_LIMIT_COUNTER_STORE = rateLimitCounterStore;
		Role = role;
		JOB_QUEUE_BATCH_SIZE = jobQueueBatchSize;
		JOB_QUEUE_POLL_SECONDS = jobQueuePollSeconds;
		JOB_LEASE_SECONDS = jobLeaseSeconds;
		JOB_QUEUE_DRAIN_BUDGET_SECONDS = jobQueueDrainBudgetSeconds;
		EMAIL_LOG_RETENTION_DAYS = emailLogRetentionDays;
		JOB_DEAD_LETTER_RETENTION_DAYS = jobDeadLetterRetentionDays;
		EMAIL_PREPARED_SEND_RETENTION_DAYS = emailPreparedSendRetentionDays;
		EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES = emailPreparedSweepMaxLagMinutes;
		SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS = systemJobOccurrenceRetentionDays;
		JOB_ALERT_LEASE_RETENTION_DAYS = jobAlertLeaseRetentionDays;
		JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST = jobRegistryDlqOrphanAllowlist;
	}

	/// <summary>
	/// Initialize environment from environment variables. Call once at startup.
	/// Loads .env.development file in Development environment.
	/// </summary>
	/// <returns>The initialized AppEnvironment instance.</returns>
	public static AppEnvironment Initialize() {
		// Thread-safety:
		// - `Initialize()` is called at startup (Program.cs), but some tooling (e.g. OpenAPI generation)
		//   and certain hosting scenarios can cause multiple entrypoints/threads to access config.
		// - We guarantee exactly-once initialization with a lock + Volatile reads/writes so that
		//   any thread that reads `Instance` after initialization sees a fully-constructed object.
		var existing = Volatile.Read(ref _instance);
		if (existing is not null) {
			return existing;
		}

		lock (InitLock) {
			existing = Volatile.Read(ref _instance);
			if (existing is not null) {
				return existing;
			}

			LoadDotEnvIfDevelopment();

			var settings = new AppEnvironment(
				// Environment variables
				postgresConnectionString: GetRequiredString(nameof(POSTGRES_CONNECTION_STRING)),
				frontUrl: GetRequiredString(nameof(FRONT_URL)),
				resendApiKey: GetRequiredString(nameof(RESEND_API_KEY)),
				staffOwnerEmail: GetRequiredString(nameof(STAFF_OWNER_EMAIL)),
				staffOwnerBootstrapCode: GetRequiredString(nameof(STAFF_OWNER_BOOTSTRAP_CODE)),
				socialAccountsMasterKey: GetRequiredString("SOCIAL_ACCOUNTS_MASTER_KEY"),
				appName: GetRequiredString(nameof(APP_NAME)),
				defaultEmailSenderEmail: GetRequiredString(nameof(DEFAULT_EMAIL_SENDER_EMAIL)),
				defaultEmailSenderName: GetRequiredString(nameof(DEFAULT_EMAIL_SENDER_NAME)),
				sessionTokenHeaderKey: GetRequiredString(nameof(SESSION_TOKEN_HEADER_KEY)),
				tenantIdHeaderKey: GetRequiredString(nameof(TENANT_ID_HEADER_KEY)),
				sessionExpiryDays: GetRequiredInt(nameof(SESSION_EXPIRY_DAYS)),
				emailVerifyTokenValidityDuration: GetRequiredInt(nameof(EMAIL_VERIFY_TOKEN_VALIDITY_DURATION)),
				passwordResetTokenValidityDuration: GetRequiredInt(nameof(PASSWORD_RESET_TOKEN_VALIDITY_DURATION)),
				passwordMinLength: GetRequiredInt(nameof(PASSWORD_MIN_LENGTH)),
				emailVerifyTokenLength: GetRequiredInt(nameof(EMAIL_VERIFY_TOKEN_LENGTH)),
				passwordResetTokenLength: GetRequiredInt(nameof(PASSWORD_RESET_TOKEN_LENGTH)),
				invitationTokenLength: GetRequiredInt(nameof(INVITATION_TOKEN_LENGTH)),
				diManifestEnabled: GetOptionalBool(nameof(DI_MANIFEST_ENABLED), false),
				auditLogExportMaxRows: GetOptionalInt(nameof(AUDIT_LOG_EXPORT_MAX_ROWS), 10000),
				maxProfilesPerUser: GetOptionalInt(nameof(MAX_PROFILES_PER_USER), 5),
				tenantUserExportMaxRows: GetOptionalInt(nameof(TENANT_USER_EXPORT_MAX_ROWS), 10000),
				tenantActivityThrottleMinutes: GetOptionalInt(nameof(TENANT_ACTIVITY_THROTTLE_MINUTES), 5),
				// Relative to the process's current working directory — mirrors how
				// the Serilog file sink resolves ".artifacts/logs" (see LoggerConfigExtensions).
				// This keeps the default identical across `dotnet watch run` (CWD = apps/api),
				// `dotnet test` (CWD = test output dir), and the published container (CWD = /app),
				// with no repo-root lookup needed.
				fileStorageRoot: GetOptionalString(nameof(FILE_STORAGE_ROOT), ".artifacts/storage"),
				uploadMaxBytes: GetOptionalInt(nameof(UPLOAD_MAX_BYTES), 2_000_000),
				uploadGlobalMaxBytes: GetOptionalLong(
					nameof(UPLOAD_GLOBAL_MAX_BYTES),
					DefaultUploadGlobalMaxBytes
				),
				uploadPerStaffMaxBytes: GetOptionalLong(
					nameof(UPLOAD_PER_STAFF_MAX_BYTES),
					DefaultUploadPerStaffMaxBytes
				),
				uploadOrphanGraceDays: GetOptionalInt(nameof(UPLOAD_ORPHAN_GRACE_DAYS), 7),
				uploadStaleReservationTtlMinutes: GetOptionalInt(
					nameof(UPLOAD_STALE_RESERVATION_TTL_MINUTES), 60
				),
				uploadStoredOrphanTtlMinutes: GetOptionalInt(
					nameof(UPLOAD_STORED_ORPHAN_TTL_MINUTES), 1440
				),
				trustedProxyCidrs: GetOptionalCsvList(
					nameof(TRUSTED_PROXY_CIDRS),
					["127.0.0.1/32", "::1/128"]
				),
				anonAuthIpRateLimitPermitLimit: GetOptionalInt(
					nameof(ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT),
					30
				),
				anonAuthIpRateLimitWindowSeconds: GetOptionalInt(
					nameof(ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				anonAuthEmailRateLimitPermitLimit: GetOptionalInt(
					nameof(ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT),
					30
				),
				anonAuthEmailRateLimitWindowSeconds: GetOptionalInt(
					nameof(ANON_AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				passwordResetEmailRateLimitPermitLimit: GetOptionalInt(
					nameof(PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT),
					3
				),
				passwordResetEmailRateLimitWindowSeconds: GetOptionalInt(
					nameof(PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS),
					900
				),
				globalRateLimitPermitLimit: GetOptionalInt(
					nameof(GLOBAL_RATE_LIMIT_PERMIT_LIMIT),
					6_000
				),
				globalRateLimitWindowSeconds: GetOptionalInt(
					nameof(GLOBAL_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				anonymousOtherRateLimitPermitLimit: GetOptionalInt(
					nameof(ANONYMOUS_OTHER_RATE_LIMIT_PERMIT_LIMIT),
					120
				),
				anonymousOtherRateLimitWindowSeconds: GetOptionalInt(
					nameof(ANONYMOUS_OTHER_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				authenticatedRateLimitPermitLimit: GetOptionalInt(
					nameof(AUTHENTICATED_RATE_LIMIT_PERMIT_LIMIT),
					600
				),
				authenticatedRateLimitWindowSeconds: GetOptionalInt(
					nameof(AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				heavySearchRateLimitPermitLimit: GetOptionalInt(
					nameof(HEAVY_SEARCH_RATE_LIMIT_PERMIT_LIMIT),
					180
				),
				heavySearchRateLimitWindowSeconds: GetOptionalInt(
					nameof(HEAVY_SEARCH_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				bulkRateLimitPermitLimit: GetOptionalInt(
					nameof(BULK_RATE_LIMIT_PERMIT_LIMIT),
					30
				),
				bulkRateLimitWindowSeconds: GetOptionalInt(
					nameof(BULK_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				tenantBulkRateLimitPermitLimit: GetOptionalInt(
					nameof(TENANT_BULK_RATE_LIMIT_PERMIT_LIMIT),
					120
				),
				tenantBulkRateLimitWindowSeconds: GetOptionalInt(
					nameof(TENANT_BULK_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				emailRateLimitPermitLimit: GetOptionalInt(
					nameof(EMAIL_RATE_LIMIT_PERMIT_LIMIT),
					10
				),
				emailRateLimitWindowSeconds: GetOptionalInt(
					nameof(EMAIL_RATE_LIMIT_WINDOW_SECONDS),
					900
				),
				tenantEmailRateLimitPermitLimit: GetOptionalInt(
					nameof(TENANT_EMAIL_RATE_LIMIT_PERMIT_LIMIT),
					50
				),
				tenantEmailRateLimitWindowSeconds: GetOptionalInt(
					nameof(TENANT_EMAIL_RATE_LIMIT_WINDOW_SECONDS),
					900
				),
				exportRateLimitPermitLimit: GetOptionalInt(
					nameof(EXPORT_RATE_LIMIT_PERMIT_LIMIT),
					10
				),
				exportRateLimitWindowSeconds: GetOptionalInt(
					nameof(EXPORT_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				tenantExportRateLimitPermitLimit: GetOptionalInt(
					nameof(TENANT_EXPORT_RATE_LIMIT_PERMIT_LIMIT),
					40
				),
				tenantExportRateLimitWindowSeconds: GetOptionalInt(
					nameof(TENANT_EXPORT_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				uploadRateLimitPermitLimit: GetOptionalInt(
					nameof(UPLOAD_RATE_LIMIT_PERMIT_LIMIT),
					20
				),
				uploadRateLimitWindowSeconds: GetOptionalInt(
					nameof(UPLOAD_RATE_LIMIT_WINDOW_SECONDS),
					60
				),
				// Stricter-than-read window for the routes that call Bluesky with
				// user-supplied credentials (Epic C §4): 5 attempts per hour by default.
				socialConnectRateLimitPermitLimit: GetOptionalInt(
					nameof(SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT),
					5
				),
				socialConnectRateLimitWindowSeconds: GetOptionalInt(
					nameof(SOCIAL_CONNECT_RATE_LIMIT_WINDOW_SECONDS),
					3600
				),
				// Optional (#953): defaults to postgres so scaling to a second replica
				// still yields one fleet-wide budget per partition; 'memory' is the
				// explicit operator escape hatch.
				rateLimitCounterStore: GetOptionalString(
					nameof(RATE_LIMIT_COUNTER_STORE),
					"postgres"
				),
				// Fail-fast here (same InvalidOperationException path the other vars use),
				// before the validator runs — neither an unparseable role nor an absent one
				// outside Development/Testing can produce an enum value to range-check
				// (design §3.1, C6/F24). The `All` argument is the DEV/TEST-ONLY default;
				// GetOptionalAppRole applies it only in those environments.
				role: GetOptionalAppRole(AppRoleVariableName, AppRole.All),
				jobQueueBatchSize: GetOptionalInt(nameof(JOB_QUEUE_BATCH_SIZE), 20),
				jobQueuePollSeconds: GetOptionalInt(nameof(JOB_QUEUE_POLL_SECONDS), 5),
				jobLeaseSeconds: GetOptionalInt(nameof(JOB_LEASE_SECONDS), 300),
				jobQueueDrainBudgetSeconds: GetOptionalInt(
					nameof(JOB_QUEUE_DRAIN_BUDGET_SECONDS), 60),
				emailLogRetentionDays: GetOptionalInt(nameof(EMAIL_LOG_RETENTION_DAYS), 180),
				jobDeadLetterRetentionDays: GetOptionalInt(
					nameof(JOB_DEAD_LETTER_RETENTION_DAYS), 90),
				emailPreparedSendRetentionDays: GetOptionalInt(
					nameof(EMAIL_PREPARED_SEND_RETENTION_DAYS), 7),
				emailPreparedSweepMaxLagMinutes: GetOptionalInt(
					nameof(EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES), 60),
				systemJobOccurrenceRetentionDays: GetOptionalInt(
					nameof(SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS), 30),
				jobAlertLeaseRetentionDays: GetOptionalInt(
					nameof(JOB_ALERT_LEASE_RETENTION_DAYS), 30),
				jobRegistryDlqOrphanAllowlist: GetOptionalCsvList(
					nameof(JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST))
			);

			var validator = new AppEnvironmentValidator();
			var result = validator.Validate(settings);

			if (!result.IsValid) {
				var errors = string.Join("\n  • ", result.Errors.Select(e => e.ErrorMessage));
				throw new InvalidOperationException($"Environment validation failed:\n  • {errors}");
			}

			Volatile.Write(ref _instance, settings);
			return settings;
		}
	}

	private static string GetRequiredString(string name) {
		var value = Environment.GetEnvironmentVariable(name);
		if (string.IsNullOrWhiteSpace(value)) {
			throw new InvalidOperationException($"Environment variable '{name}' is not set");
		}

		return value.Trim();
	}

	private static int GetRequiredInt(string name) {
		var value = Environment.GetEnvironmentVariable(name);
		if (string.IsNullOrWhiteSpace(value)) {
			throw new InvalidOperationException($"Environment variable '{name}' is not set");
		}

		if (!int.TryParse(value.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var result)) {
			throw new InvalidOperationException(
				$"Environment variable '{name}' must be a valid integer, got '{value.Trim()}'");
		}

		return result;
	}

	private static bool GetOptionalBool(string name, bool defaultValue) {
		var value = Environment.GetEnvironmentVariable(name);
		if (string.IsNullOrWhiteSpace(value)) {
			return defaultValue;
		}

		var trimmed = value.Trim();
		if (trimmed.Equals("true", StringComparison.OrdinalIgnoreCase) || trimmed.Equals("1", StringComparison.Ordinal)) {
			return true;
		}

		if (trimmed.Equals("false", StringComparison.OrdinalIgnoreCase) || trimmed.Equals("0", StringComparison.Ordinal)) {
			return false;
		}

		throw new InvalidOperationException(
			$"Environment variable '{name}' must be a valid boolean (true/false/1/0), got '{trimmed}'");
	}

	private static string GetOptionalString(string name, string defaultValue) {
		var value = Environment.GetEnvironmentVariable(name);
		return string.IsNullOrWhiteSpace(value) ? defaultValue : value.Trim();
	}

	private static int GetOptionalInt(string name, int defaultValue) {
		var value = Environment.GetEnvironmentVariable(name);
		if (string.IsNullOrWhiteSpace(value)) {
			return defaultValue;
		}

		if (!int.TryParse(
			value.Trim(),
			NumberStyles.Integer,
			CultureInfo.InvariantCulture,
			out var result
		)) {
			throw new InvalidOperationException(
				$"Environment variable '{name}' must be a valid integer, got '{value.Trim()}'");
		}

		return result;
	}

	internal static long GetOptionalLong(string name, long defaultValue) {
		return ParseOptionalLong(
			name,
			Environment.GetEnvironmentVariable(name),
			defaultValue
		);
	}

	internal static long ParseOptionalLong(
		string name,
		string? value,
		long defaultValue
	) {
		if (string.IsNullOrWhiteSpace(value)) {
			return defaultValue;
		}

		if (!long.TryParse(
			value.Trim(),
			NumberStyles.Integer,
			CultureInfo.InvariantCulture,
			out var result
		)) {
			throw new InvalidOperationException(
				$"Environment variable '{name}' must be a valid integer, got '{value.Trim()}'"
			);
		}

		return result;
	}

	// The Role property is named for its use, not its variable, so the env-var name is a
	// constant rather than a nameof().
	internal const string AppRoleVariableName = "APP_ROLE";

	// The ONLY environments where an absent APP_ROLE may fall back to `All` (design §3.1,
	// C6/F24). Note an unset ASPNETCORE_ENVIRONMENT resolves to Production (see
	// GetHostEnvironmentName), so it is correctly NOT covered here — the build-time
	// OpenAPI path runs with the host environment unset and must pin APP_ROLE=api.
	internal static bool IsAppRoleDefaultAllowed {
		get { return IsDevelopment || IsTesting; }
	}

	// Whether APP_ROLE was explicitly provided. Backs the validator's defense-in-depth
	// rule mirroring GetOptionalAppRole's fail-fast.
	internal static bool IsAppRoleExplicitlySet {
		get {
			return !string.IsNullOrWhiteSpace(
				Environment.GetEnvironmentVariable(AppRoleVariableName)
			);
		}
	}

	internal static bool IsTrustedProxyCidrsExplicitlySet {
		get {
			return !string.IsNullOrWhiteSpace(
				Environment.GetEnvironmentVariable(
					nameof(TRUSTED_PROXY_CIDRS)
				)
			);
		}
	}

	// Case-insensitive APP_ROLE parse via an explicit map (never ToLower() — PUBLY0003).
	// The map is the whole accepted set; anything else fails fast.
	private static readonly IReadOnlyDictionary<string, AppRole> AppRoleMap =
		new Dictionary<string, AppRole>(StringComparer.OrdinalIgnoreCase) {
			["api"] = AppRole.Api,
			["worker"] = AppRole.Worker,
			["all"] = AppRole.All,
		};

	// Environment-gated (design §3.1, C6/F24): <paramref name="defaultValue"/> is applied
	// ONLY under Development/Testing. Everywhere else a missing/blank APP_ROLE is invalid
	// and fails fast on the same InvalidOperationException path GetRequiredString uses, so
	// `All` — which composes the job engine — can never leak into a production-like
	// process by omission.
	private static AppRole GetOptionalAppRole(string name, AppRole defaultValue) {
		var value = Environment.GetEnvironmentVariable(name);
		if (string.IsNullOrWhiteSpace(value)) {
			if (IsAppRoleDefaultAllowed) {
				return defaultValue;
			}

			throw new InvalidOperationException(
				$"Environment variable '{name}' is not set. It is REQUIRED in the "
				+ $"'{GetHostEnvironmentName()}' environment and must be one of 'api', "
				+ "'worker', or 'all' (case-insensitive). It defaults to 'all' only in the "
				+ $"'{EnvironmentNames.Development}' and '{EnvironmentNames.Testing}' "
				+ "environments: 'all' composes the job engine into the process, so it must "
				+ "never be inherited by omission by a process intended as API-only. Pin it "
				+ "explicitly (APP_ROLE=api for HTTP/migration/tooling hosts, "
				+ "APP_ROLE=worker for the job engine).");
		}

		if (AppRoleMap.TryGetValue(value.Trim(), out var role)) {
			return role;
		}

		throw new InvalidOperationException(
			$"Environment variable '{name}' must be one of 'api', 'worker', or 'all' "
			+ $"(case-insensitive), got '{value.Trim()}'");
	}

	// Splits an optional CSV env var into trimmed, non-empty entries, preserving order
	// and dropping duplicates. Absent/blank yields an empty list.
	private static IReadOnlyList<string> GetOptionalCsvList(
		string name,
		IReadOnlyList<string>? defaultValue = null
	) {
		var value = Environment.GetEnvironmentVariable(name);
		if (string.IsNullOrWhiteSpace(value)) {
			return defaultValue ?? [];
		}

		return value
			.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
			.Distinct(StringComparer.Ordinal)
			.ToList();
	}

	private static byte[] ParseMasterKey(string name, string value) {
		var trimmed = (value ?? string.Empty).Trim();
		if (trimmed.Length == 0) {
			throw new InvalidOperationException(
				$"{name} is required (base64-encoded, exactly 32 bytes)."
			);
		}
		byte[] bytes;
		try {
			bytes = Convert.FromBase64String(trimmed);
		} catch (FormatException) {
			throw new InvalidOperationException(
				$"{name} must be base64-encoded."
			);
		}
		if (bytes.Length != 32) {
			throw new InvalidOperationException(
				$"{name} must decode to exactly 32 bytes (AES-256-GCM key); got {bytes.Length}."
			);
		}
		return bytes;
	}

	private static string GetHostEnvironmentName() {
		return Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
		?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
		?? EnvironmentNames.Production;
	}

	private static void LoadDotEnvIfDevelopment() {
		// Why this exists (important, non-obvious):
		//
		// 1) Local development:
		//    - We keep "development defaults" in a repo-root `.env.development`.
		//    - When the host environment is explicitly "Development" (via launchSettings, CLI, etc),
		//      we load that file so `AppEnvironment.Initialize()` can fail-fast with a useful error
		//      if any required values are missing.
		//
		// 2) Build-time OpenAPI generation:
		//    - The `Microsoft.Extensions.ApiDescription.Server` MSBuild target runs `dotnet-getdocument`,
		//      which executes the app to discover endpoints and generate OpenAPI.
		//    - That tool invocation frequently does NOT set `ASPNETCORE_ENVIRONMENT`/`DOTNET_ENVIRONMENT`.
		//    - Loading `.env.development` supplies the required CONFIG values (connection string, etc.)
		//      so the app can boot far enough to emit the document.
		//
		// IMPORTANT (APP_ROLE, design §3.1): loading `.env.development` does NOT change
		// `GetHostEnvironmentName()`. An unset host environment is still classified as Production,
		// where APP_ROLE is REQUIRED and a missing value fails fast in `GetOptionalAppRole`. So this
		// method does NOT make bare `dotnet build` work on its own — the build additionally needs
		// APP_ROLE=api. Repo builds must use the pinned `just` recipes (build-api, generate-client,
		// db-*), which export APP_ROLE=api; that is the sanctioned path, not a bare `dotnet build`.
		//
		// Design choice:
		// - If the host environment is explicitly set (Production/Staging/etc), we DO NOT load `.env.development`.
		// - If the host environment is explicitly "Development", we DO load `.env.development`.
		// - If the host environment is UNSET (neither ASPNETCORE_ENVIRONMENT nor DOTNET_ENVIRONMENT is set),
		//   we also load `.env.development` to supply config values for build-time OpenAPI generation
		//   (which still requires APP_ROLE=api to be pinned — see above).
		//
		// Security/safety note:
		// - We intentionally do NOT mutate `ASPNETCORE_ENVIRONMENT` here. Changing the host environment
		//   affects framework behavior (logging, error pages, etc.) and can be risky if misapplied.
		// - This method only loads config values, and only when the environment is Development or unset.
		var aspNetEnvironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
		var dotNetEnvironment = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");

		var isEnvironmentUnset =
			string.IsNullOrWhiteSpace(aspNetEnvironment)
			&& string.IsNullOrWhiteSpace(dotNetEnvironment);

		var isDevelopment = string.Equals(
			GetHostEnvironmentName(),
			EnvironmentNames.Development,
			StringComparison.OrdinalIgnoreCase
		);
		if (!isDevelopment && !isEnvironmentUnset) {
			return;
		}

		var path = FindDotEnvPath(".env.development");
		if (path is null) {
			var reason = isDevelopment
				? "Host environment is Development"
				: "Host environment is unset (needed for build-time OpenAPI generation)";

			throw new InvalidOperationException(
				$"Could not find `.env.development` file ({reason}). " +
				"Either create the file at the repo root, or provide the required environment variables via your host/CI.");
		}

		// NoClobber (#1019): DotNetEnv 3.1.1's default is file-wins-over-process — an
		// already-set process/CLI env var (e.g. `just db-migrate`'s $APP_ROLE="api", or a
		// launcher pinning APP_ROLE for a child process) would otherwise be silently
		// overwritten by whatever this file says, with no warning. That is backwards from
		// every other dotenv-style loader's convention (the file supplies a DEFAULT, an
		// explicit env var overrides it) and was verified empirically: without this option,
		// an env var set immediately before this call was read back as the file's value
		// after it. This affects ONLY Development/unset-host-environment processes (see the
		// early return above) — Testing/Production/Staging never reach this line.
		DotNetEnv.Env.Load(path, DotNetEnv.LoadOptions.NoClobber());
	}

	public static string? FindDotEnvPath(string fileName) {
		// We intentionally search parent directories because the current working directory can vary:
		// - `dotnet run` often uses `apps/api/`
		// - build-time OpenAPI generation can execute from `apps/api/bin/...` or another working dir
		// Walking up ensures we can find the repo-root `.env.development` reliably.
		var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
		while (directory is not null) {
			var candidate = Path.Combine(directory.FullName, fileName);
			if (File.Exists(candidate)) {
				return candidate;
			}

			directory = directory.Parent;
		}

		return null;
	}
}

public class AppEnvironmentValidator : AbstractValidator<AppEnvironment> {
	public AppEnvironmentValidator() {
		// Environment variables
		RuleFor(x => x.POSTGRES_CONNECTION_STRING)
			.NotEmpty().WithMessage("POSTGRES_CONNECTION_STRING is not set or is empty")
			.Must(BeValidPostgresConnectionString)
			.WithMessage("POSTGRES_CONNECTION_STRING must be a valid PostgreSQL connection string");

		RuleFor(x => x.FRONT_URL)
			.NotEmpty().WithMessage("FRONT_URL is not set or is empty")
			.Must(BeValidUrl)
			.WithMessage("FRONT_URL must be a valid URL");

		RuleFor(x => x.RESEND_API_KEY)
			.NotEmpty().WithMessage("RESEND_API_KEY is not set or is empty");

		RuleFor(x => x.STAFF_OWNER_EMAIL)
			.NotEmpty().WithMessage("STAFF_OWNER_EMAIL is not set or is empty")
			.EmailAddress().WithMessage("STAFF_OWNER_EMAIL must be a valid email address");

		RuleFor(x => x.STAFF_OWNER_BOOTSTRAP_CODE)
			.NotEmpty().WithMessage("STAFF_OWNER_BOOTSTRAP_CODE is not set or is empty");

		// App settings
		RuleFor(x => x.APP_NAME)
			.NotEmpty().WithMessage("APP_NAME is not set or is empty");

		RuleFor(x => x.DEFAULT_EMAIL_SENDER_EMAIL)
			.NotEmpty().WithMessage("DEFAULT_EMAIL_SENDER_EMAIL is not set or is empty")
			.EmailAddress().WithMessage("DEFAULT_EMAIL_SENDER_EMAIL must be a valid email address");

		RuleFor(x => x.DEFAULT_EMAIL_SENDER_NAME)
			.NotEmpty().WithMessage("DEFAULT_EMAIL_SENDER_NAME is not set or is empty");

		RuleFor(x => x.SESSION_TOKEN_HEADER_KEY)
			.NotEmpty().WithMessage("SESSION_TOKEN_HEADER_KEY is not set or is empty");

		RuleFor(x => x.TENANT_ID_HEADER_KEY)
			.NotEmpty().WithMessage("TENANT_ID_HEADER_KEY is not set or is empty");

		RuleFor(x => x.SESSION_EXPIRY_DAYS)
			.InclusiveBetween(1, 365).WithMessage("SESSION_EXPIRY_DAYS must be between 1 and 365");

		RuleFor(x => x.EMAIL_VERIFY_TOKEN_VALIDITY_DURATION)
			.InclusiveBetween(1, 365)
			.WithMessage("EMAIL_VERIFY_TOKEN_VALIDITY_DURATION must be between 1 and 365");

		RuleFor(x => x.PASSWORD_RESET_TOKEN_VALIDITY_DURATION)
			.InclusiveBetween(1, 365)
			.WithMessage("PASSWORD_RESET_TOKEN_VALIDITY_DURATION must be between 1 and 365");

		RuleFor(x => x.PASSWORD_MIN_LENGTH)
			.InclusiveBetween(1, 100).WithMessage("PASSWORD_MIN_LENGTH must be between 1 and 100");

		RuleFor(x => x.EMAIL_VERIFY_TOKEN_LENGTH)
			.GreaterThanOrEqualTo(25).WithMessage("EMAIL_VERIFY_TOKEN_LENGTH must be at least 25");

		RuleFor(x => x.PASSWORD_RESET_TOKEN_LENGTH)
			.GreaterThanOrEqualTo(25).WithMessage("PASSWORD_RESET_TOKEN_LENGTH must be at least 25");

		RuleFor(x => x.INVITATION_TOKEN_LENGTH)
			.GreaterThanOrEqualTo(25).WithMessage("INVITATION_TOKEN_LENGTH must be at least 25");

		RuleFor(x => x.AUDIT_LOG_EXPORT_MAX_ROWS)
			.InclusiveBetween(1, 1_000_000)
			.WithMessage("AUDIT_LOG_EXPORT_MAX_ROWS must be between 1 and 1000000");

		RuleFor(x => x.MAX_PROFILES_PER_USER)
			.InclusiveBetween(1, 50)
			.WithMessage("MAX_PROFILES_PER_USER must be between 1 and 50");

		RuleFor(x => x.TENANT_USER_EXPORT_MAX_ROWS)
			.InclusiveBetween(1, 1_000_000)
			.WithMessage("TENANT_USER_EXPORT_MAX_ROWS must be between 1 and 1000000");

		RuleFor(x => x.TENANT_ACTIVITY_THROTTLE_MINUTES)
			.InclusiveBetween(1, 1_440)
			.WithMessage("TENANT_ACTIVITY_THROTTLE_MINUTES must be between 1 and 1440");

		RuleFor(x => x.FILE_STORAGE_ROOT)
			.NotEmpty().WithMessage("FILE_STORAGE_ROOT is not set or is empty");

		RuleFor(x => x.UPLOAD_MAX_BYTES)
			.InclusiveBetween(1, 100_000_000)
			.WithMessage("UPLOAD_MAX_BYTES must be between 1 and 100000000");

		RuleFor(x => x.UPLOAD_GLOBAL_MAX_BYTES)
			.GreaterThan(0)
			.WithMessage("UPLOAD_GLOBAL_MAX_BYTES must be positive");

		RuleFor(x => x.UPLOAD_PER_STAFF_MAX_BYTES)
			.GreaterThan(0)
			.WithMessage("UPLOAD_PER_STAFF_MAX_BYTES must be positive");

		RuleFor(x => x.UPLOAD_GLOBAL_MAX_BYTES)
			.GreaterThanOrEqualTo(x => x.UPLOAD_PER_STAFF_MAX_BYTES)
			.WithMessage(
				"UPLOAD_GLOBAL_MAX_BYTES must be greater than or equal to UPLOAD_PER_STAFF_MAX_BYTES"
			);

		RuleFor(x => x.UPLOAD_ORPHAN_GRACE_DAYS)
			.InclusiveBetween(1, 365)
			.WithMessage("UPLOAD_ORPHAN_GRACE_DAYS must be between 1 and 365");

		RuleFor(x => x.UPLOAD_STALE_RESERVATION_TTL_MINUTES)
			.InclusiveBetween(1, 10080)
			.WithMessage(
				"UPLOAD_STALE_RESERVATION_TTL_MINUTES must be between 1 and 10080 (7 days)"
			);

		RuleFor(x => x.UPLOAD_STORED_ORPHAN_TTL_MINUTES)
			.InclusiveBetween(5, 20160)
			.WithMessage(
				"UPLOAD_STORED_ORPHAN_TTL_MINUTES must be between 5 and 20160 (14 days)"
			);

		RuleForEach(x => x.TRUSTED_PROXY_CIDRS)
			.Must(cidr => IPNetwork.TryParse(cidr, out _))
			.WithMessage("TRUSTED_PROXY_CIDRS entries must use valid CIDR notation");

		RuleForEach(x => x.TRUSTED_PROXY_CIDRS)
			.Must(cidr =>
				!IPNetwork.TryParse(cidr, out var network)
				|| network.PrefixLength != 0
			)
			.WithMessage(
				"TRUSTED_PROXY_CIDRS entries must not trust a universal network"
			);

		RuleFor(x => x.TRUSTED_PROXY_CIDRS)
			.Must(_ => AppEnvironment.IsTrustedProxyCidrsExplicitlySet)
			.When(x => AppEnvironment.IsProduction && x.IsApiRole)
			.WithMessage(
				"TRUSTED_PROXY_CIDRS must be set explicitly for a production API role");

		RuleFor(x => x.ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 10_000)
			.WithMessage(
				"ANON_AUTH_IP_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 10000");

		RuleFor(x => x.ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"ANON_AUTH_IP_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 10_000)
			.WithMessage(
				"ANON_AUTH_EMAIL_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 10000");

		RuleFor(x => x.ANON_AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"ANON_AUTH_EMAIL_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 10_000)
			.WithMessage(
				"PASSWORD_RESET_EMAIL_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 10000");

		RuleFor(x => x.PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.GLOBAL_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"GLOBAL_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.GLOBAL_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"GLOBAL_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.ANONYMOUS_OTHER_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"ANONYMOUS_OTHER_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.ANONYMOUS_OTHER_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"ANONYMOUS_OTHER_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.AUTHENTICATED_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"AUTHENTICATED_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"AUTHENTICATED_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.HEAVY_SEARCH_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"HEAVY_SEARCH_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.HEAVY_SEARCH_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"HEAVY_SEARCH_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.BULK_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"BULK_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.BULK_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"BULK_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.TENANT_BULK_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"TENANT_BULK_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.TENANT_BULK_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"TENANT_BULK_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.EMAIL_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"EMAIL_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.EMAIL_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"EMAIL_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.TENANT_EMAIL_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"TENANT_EMAIL_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.TENANT_EMAIL_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"TENANT_EMAIL_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.EXPORT_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"EXPORT_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.EXPORT_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"EXPORT_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.TENANT_EXPORT_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"TENANT_EXPORT_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.TENANT_EXPORT_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"TENANT_EXPORT_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.UPLOAD_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"UPLOAD_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.UPLOAD_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"UPLOAD_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		RuleFor(x => x.SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT)
			.InclusiveBetween(1, 100_000)
			.WithMessage(
				"SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT must be between 1 and 100000");

		RuleFor(x => x.SOCIAL_CONNECT_RATE_LIMIT_WINDOW_SECONDS)
			.InclusiveBetween(1, 86_400)
			.WithMessage(
				"SOCIAL_CONNECT_RATE_LIMIT_WINDOW_SECONDS must be between 1 and 86400");

		// APP_ROLE is already parsed to a defined enum by GetOptionalAppRole (which
		// fails fast on any other string); this rule is defense-in-depth against an
		// undefined enum value ever reaching startup.
		RuleFor(x => x.Role)
			.IsInEnum().WithMessage("APP_ROLE must be a valid hosting role (api/worker/all)");

		// Environment-gated default (design §3.1, C6/F24). Defense in depth mirroring
		// GetOptionalAppRole's fail-fast: outside Development/Testing, a role that was
		// never set must not boot. `All` composes the job engine, so a process that
		// inherited it by omission would run the worker surface — and double-claim queue
		// rows — inside a container an operator intended as API-only.
		RuleFor(x => x.Role)
			.Must(_ => AppEnvironment.IsAppRoleExplicitlySet)
			.When(_ => !AppEnvironment.IsAppRoleDefaultAllowed)
			.WithMessage(
				$"{AppEnvironment.AppRoleVariableName} must be set explicitly "
				+ "(api/worker/all) outside the Development and Testing environments; "
				+ "'all' is never an implicit default");

		RuleFor(x => x.JOB_QUEUE_BATCH_SIZE)
			.InclusiveBetween(1, 1_000)
			.WithMessage("JOB_QUEUE_BATCH_SIZE must be between 1 and 1000");

		RuleFor(x => x.JOB_QUEUE_POLL_SECONDS)
			.InclusiveBetween(1, 3_600)
			.WithMessage("JOB_QUEUE_POLL_SECONDS must be between 1 and 3600");

		// Hard 10-second floor (design §3.1, R3-4/O12), NOT 1: the engine reserves a
		// 2-second minimum safety margin before lease expiry and must still fit at least
		// one bounded renewal retry inside the remainder. A 1-second lease leaves no room
		// for either, so sub-10s leases are rejected at startup rather than pretending to
		// be supportable.
		RuleFor(x => x.JOB_LEASE_SECONDS)
			.InclusiveBetween(10, 86_400)
			.WithMessage("JOB_LEASE_SECONDS must be between 10 and 86400");

		RuleFor(x => x.JOB_QUEUE_DRAIN_BUDGET_SECONDS)
			.InclusiveBetween(1, 3_600)
			.WithMessage("JOB_QUEUE_DRAIN_BUDGET_SECONDS must be between 1 and 3600");

		RuleFor(x => x.EMAIL_LOG_RETENTION_DAYS)
			.InclusiveBetween(1, 3_650)
			.WithMessage("EMAIL_LOG_RETENTION_DAYS must be between 1 and 3650");

		RuleFor(x => x.JOB_DEAD_LETTER_RETENTION_DAYS)
			.InclusiveBetween(1, 3_650)
			.WithMessage("JOB_DEAD_LETTER_RETENTION_DAYS must be between 1 and 3650");

		RuleFor(x => x.EMAIL_PREPARED_SEND_RETENTION_DAYS)
			.InclusiveBetween(1, 3_650)
			.WithMessage("EMAIL_PREPARED_SEND_RETENTION_DAYS must be between 1 and 3650");

		RuleFor(x => x.EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES)
			.InclusiveBetween(1, 525_600)
			.WithMessage("EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES must be between 1 and 525600");

		RuleFor(x => x.SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS)
			.InclusiveBetween(1, 3_650)
			.WithMessage("SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS must be between 1 and 3650");

		RuleFor(x => x.JOB_ALERT_LEASE_RETENTION_DAYS)
			.InclusiveBetween(1, 3_650)
			.WithMessage("JOB_ALERT_LEASE_RETENTION_DAYS must be between 1 and 3650");

		// Exact job_type strings only (design §3.1/§5.4, R2-9). A wildcard would turn an
		// audited, per-type escape for retired DLQ handlers into the global bypass the
		// design explicitly refuses, so any pattern metacharacter is rejected at startup.
		RuleForEach(x => x.JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST)
			.Must(entry => entry.IndexOfAny(['*', '?', '%']) < 0)
			.WithMessage(
				"JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST entries must be exact job_type strings; "
				+ "wildcards ('*', '?', '%') are not allowed");

		RuleFor(x => x.SESSION_TOKEN_HEADER_KEY)
			.Must(BeValidHeaderName)
			.WithMessage("SESSION_TOKEN_HEADER_KEY must be a valid HTTP header name");

		RuleFor(x => x.TENANT_ID_HEADER_KEY)
			.Must(BeValidHeaderName)
			.WithMessage("TENANT_ID_HEADER_KEY must be a valid HTTP header name");
	}

	private static bool BeValidUrl(string url) {
		return Uri.TryCreate(url, UriKind.Absolute, out var uri)
		&& (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
		&& !string.IsNullOrWhiteSpace(uri.Host)
		&& string.IsNullOrEmpty(uri.UserInfo)
		&& uri.AbsolutePath is "/"
		&& string.IsNullOrEmpty(uri.Query)
		&& string.IsNullOrEmpty(uri.Fragment);
	}

	private static bool BeValidHeaderName(string headerName) {
		return !string.IsNullOrWhiteSpace(headerName)
		&& headerName.All(c => char.IsLetterOrDigit(c) || c == '-');
	}

	private static bool BeValidPostgresConnectionString(string connectionString) {
		try {
			var builder = new NpgsqlConnectionStringBuilder(connectionString);
			return !string.IsNullOrWhiteSpace(builder.Host)
				&& !string.IsNullOrWhiteSpace(builder.Database)
				&& !string.IsNullOrWhiteSpace(builder.Username)
				&& !string.IsNullOrWhiteSpace(builder.Password);
		} catch {
			return false;
		}
	}
}
