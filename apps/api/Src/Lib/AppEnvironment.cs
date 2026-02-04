using FluentValidation;

namespace MainApi.Src.Lib;

public static class AppEnvironment {
	public static string POSTGRES_CONNECTION_STRING { get { return GetEnvVar(nameof(_POSTGRES_CONNECTION_STRING)); } }
	private static string _POSTGRES_CONNECTION_STRING = string.Empty;

	public static string FRONT_URL { get { return GetEnvVar(nameof(_FRONT_URL)); } }
	private static string _FRONT_URL = string.Empty;

	public static string RESEND_API_KEY { get { return GetEnvVar(nameof(_RESEND_API_KEY)); } }
	private static string _RESEND_API_KEY = string.Empty;

	public static string STAFF_OWNER_EMAIL { get { return GetEnvVar(nameof(_STAFF_OWNER_EMAIL)); } }
	private static string _STAFF_OWNER_EMAIL = string.Empty;

	public static string STAFF_OWNER_BOOTSTRAP_CODE { get { return GetEnvVar(nameof(_STAFF_OWNER_BOOTSTRAP_CODE)); } }
	private static string _STAFF_OWNER_BOOTSTRAP_CODE = string.Empty;

	// ==================================================

	private static bool IS_DOTENV_LOADED = false;
	private static bool IS_INITIALIZED = false;
	private static readonly EnvironmentValidator _validator = new EnvironmentValidator();

	private static string GetEnvVar(string name) {
		if (!IS_INITIALIZED) {
			throw new Exception("Environment is not initialized: call AppEnvironment.LoadEnv() first");
		}

		var property = typeof(AppEnvironment).GetField(name, System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

		if (property == null) {
			throw new Exception($"Environment variable {name} is not supported by {nameof(AppEnvironment)}");
		}

		return property.GetValue(null) as string ?? string.Empty;
	}

	// ========== Environment Variables (secrets, URLs) ==========
	public string POSTGRES_CONNECTION_STRING { get; }
	public string FRONT_URL { get; }
	public string RESEND_API_KEY { get; }
	public string STAFF_OWNER_EMAIL { get; }
	public string STAFF_OWNER_BOOTSTRAP_CODE { get; }

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

	// ========== Constants (hardcoded, not from environment) ==========
#pragma warning disable CA1822
	public int PAGINATION_DEFAULT_LIMIT => 100;
	public int MAX_BULK_INVITATIONS_SIZE => 1000;
	public int DEFAULT_MAX_USERS_PER_TENANT => 5;

	// ========== Computed properties ==========
	public static bool IsDevelopment => string.Equals(
		GetHostEnvironmentName(),
		EnvironmentNames.Development,
		StringComparison.OrdinalIgnoreCase
	);

	public static bool IsProduction => string.Equals(
		GetHostEnvironmentName(),
		EnvironmentNames.Production,
		StringComparison.OrdinalIgnoreCase
	);

	public static bool IsTesting => string.Equals(
		GetHostEnvironmentName(),
		EnvironmentNames.Testing,
		StringComparison.OrdinalIgnoreCase
	);

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

	public static string EnvironmentName =>
		GetHostEnvironmentName();
#pragma warning restore CA1822

	// Private constructor - use Initialize()
	private AppEnvironment(
		// Environment variables
		string postgresConnectionString,
		string frontUrl,
		string resendApiKey,
		string staffOwnerEmail,
		string staffOwnerBootstrapCode,
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
		int maxProfilesPerUser
	) {
		POSTGRES_CONNECTION_STRING = postgresConnectionString;
		FRONT_URL = frontUrl;
		RESEND_API_KEY = resendApiKey;
		STAFF_OWNER_EMAIL = staffOwnerEmail;
		STAFF_OWNER_BOOTSTRAP_CODE = staffOwnerBootstrapCode;
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
		if (existing is not null) return existing;

		lock (InitLock) {
			existing = Volatile.Read(ref _instance);
			if (existing is not null) return existing;

			LoadDotEnvIfDevelopment();

			var settings = new AppEnvironment(
				// Environment variables
				postgresConnectionString: GetRequiredString(nameof(POSTGRES_CONNECTION_STRING)),
				frontUrl: GetRequiredString(nameof(FRONT_URL)),
				resendApiKey: GetRequiredString(nameof(RESEND_API_KEY)),
				staffOwnerEmail: GetRequiredString(nameof(STAFF_OWNER_EMAIL)),
				staffOwnerBootstrapCode: GetRequiredString(nameof(STAFF_OWNER_BOOTSTRAP_CODE)),
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
				maxProfilesPerUser: GetOptionalInt(nameof(MAX_PROFILES_PER_USER), 5)
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
		if (string.IsNullOrWhiteSpace(value)) return defaultValue;

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

	private static int GetOptionalInt(string name, int defaultValue) {
		var value = Environment.GetEnvironmentVariable(name);
		if (string.IsNullOrWhiteSpace(value)) return defaultValue;

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

	private static string GetHostEnvironmentName() =>
		Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
		?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
		?? EnvironmentNames.Production;

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
		//    - If we only loaded `.env.development` when the environment is explicitly Development,
		//      `dotnet build` would fail because the app is executed without the required env vars.
		//
		// Design choice:
		// - If the host environment is explicitly set (Production/Staging/etc), we DO NOT load `.env.development`.
		// - If the host environment is explicitly "Development", we DO load `.env.development`.
		// - If the host environment is UNSET (neither ASPNETCORE_ENVIRONMENT nor DOTNET_ENVIRONMENT is set),
		//   we also load `.env.development` to keep build-time OpenAPI generation working.
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
		if (!isDevelopment && !isEnvironmentUnset) return;

		var path = FindDotEnvPath(".env.development");
		if (path is null) {
			var reason = isDevelopment
				? "Host environment is Development"
				: "Host environment is unset (needed for build-time OpenAPI generation)";

			throw new InvalidOperationException(
				$"Could not find `.env.development` file ({reason}). " +
				"Either create the file at the repo root, or provide the required environment variables via your host/CI.");
		}

		DotNetEnv.Env.Load(path);
		IS_DOTENV_LOADED = true;
	}

	/// <summary>
	/// Determines if the application is running in Production environment
	/// </summary>
	public static bool IsProduction() {
		var environment = GetEnvironmentName();
		return string.Equals(environment, "Production", StringComparison.OrdinalIgnoreCase);
	}

	/// <summary>
	/// Determines if the application is running in Development environment
	/// </summary>
	public static bool IsDevelopment() {
		var environment = GetEnvironmentName();
		return string.Equals(environment, "Development", StringComparison.OrdinalIgnoreCase);
	}

	/// <summary>
	/// Gets the current environment name (Development, Production, Staging, etc.)
	/// </summary>
	public static string GetEnvironmentName() {
		var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");

		if (string.IsNullOrEmpty(environment)) {
			var logger = LoggerFactory
				.Create(builder => builder.AddConsole())
				.CreateLogger<Program>();
			logger.LogWarning("ASPNETCORE_ENVIRONMENT is not set, defaulting to Development");
			environment = "Development";
		}

		Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", environment);

		return environment;
	}

	private static void ValidateAndSetEnvironmentVariables() {
		var postgresConnectionString = Environment.GetEnvironmentVariable(nameof(POSTGRES_CONNECTION_STRING));
		var frontUrl = Environment.GetEnvironmentVariable(nameof(FRONT_URL));
		var resendApiKey = Environment.GetEnvironmentVariable(nameof(RESEND_API_KEY));
		var staffOwnerEmail = Environment.GetEnvironmentVariable(nameof(STAFF_OWNER_EMAIL));
		var staffOwnerBootstrapCode = Environment.GetEnvironmentVariable(nameof(STAFF_OWNER_BOOTSTRAP_CODE));

		var validationResult = _validator.Validate(new EnvironmentConfig {
			PostgresConnectionString = postgresConnectionString,
			FrontUrl = frontUrl,
			ResendApiKey = resendApiKey,
			StaffOwnerEmail = staffOwnerEmail,
			StaffOwnerBootstrapCode = staffOwnerBootstrapCode
		});

		if (!validationResult.IsValid) {
			var errors = string.Join(",\n\t\t", validationResult.Errors.Select(e => e.ErrorMessage));
			throw new Exception($"Environment validation failed:\n\t\t{errors}");
		}

		_POSTGRES_CONNECTION_STRING = postgresConnectionString!;
		_FRONT_URL = frontUrl!;
		_RESEND_API_KEY = resendApiKey!;
		_STAFF_OWNER_EMAIL = staffOwnerEmail!;
		_STAFF_OWNER_BOOTSTRAP_CODE = staffOwnerBootstrapCode!;
	}
}

public class EnvironmentConfig {
	public string? PostgresConnectionString { get; set; }
	public string? FrontUrl { get; set; }
	public string? ResendApiKey { get; set; }
	public string? StaffOwnerEmail { get; set; }
	public string? StaffOwnerBootstrapCode { get; set; }
}

public class EnvironmentValidator : AbstractValidator<EnvironmentConfig> {
	public EnvironmentValidator() {
		RuleFor(x => x.PostgresConnectionString)
			.NotEmpty().WithMessage("POSTGRES_CONNECTION_STRING is not set or is empty")
			.Must(BeValidPostgresConnectionString).WithMessage("POSTGRES_CONNECTION_STRING must be a valid PostgreSQL connection string");

		RuleFor(x => x.FrontUrl)
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

		RuleFor(x => x.SESSION_TOKEN_HEADER_KEY)
			.Must(BeValidHeaderName)
			.WithMessage("SESSION_TOKEN_HEADER_KEY must be a valid HTTP header name");

		RuleFor(x => x.TENANT_ID_HEADER_KEY)
			.Must(BeValidHeaderName)
			.WithMessage("TENANT_ID_HEADER_KEY must be a valid HTTP header name");
	}

	private static bool BeAValidUrl(string? url) {
		if (string.IsNullOrWhiteSpace(url)) {
			return false; // Or handle as per your requirements (e.g., use NotEmpty)
		}
		return Uri.TryCreate(url, UriKind.Absolute, out Uri? result)
			&& (result.Scheme == Uri.UriSchemeHttp || result.Scheme == Uri.UriSchemeHttps);
	}

	private static bool BeValidPostgresConnectionString(string? connectionString) {
		if (string.IsNullOrWhiteSpace(connectionString)) return false;

		// Basic validation for PostgreSQL connection string
		// Should contain at least Host, Database, Username, and Password
		var requiredKeys = new[] { "Host", "Database", "Username", "Password" };
		return requiredKeys.All(key => connectionString.Contains(key));
	}
}
