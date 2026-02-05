using System.Globalization;

using FluentValidation;

using Npgsql;

namespace MainApi.Src.Lib;

/// <summary>
/// Provides access to environment variables with validation.
/// Call Initialize() once at startup before accessing properties.
/// </summary>
public class AppEnvironment {
	// Static accessor for use outside DI
	private static AppEnvironment? _instance;
	private static readonly object InitLock = new();

	/// <summary>
	/// Gets the initialized instance. Throws if Initialize() hasn't been called.
	/// </summary>
	public static AppEnvironment Instance => Volatile.Read(ref _instance)
		?? throw new InvalidOperationException("AppEnvironment not initialized. Call AppEnvironment.Initialize() first.");

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

	// ========== Constants (hardcoded, not from environment) ==========
#pragma warning disable CA1822
	public int MAX_PROFILES_PER_USER => 5;
	public int PAGINATION_DEFAULT_LIMIT => 100;
	public int MAX_BULK_INVITATIONS_SIZE => 1000;
	public int DEFAULT_MAX_USERS_PER_TENANT => 5;

	// ========== Computed properties ==========
	public bool IsDevelopment => string.Equals(
		GetHostEnvironmentName(),
		"Development",
		StringComparison.OrdinalIgnoreCase
	);

	public bool IsProduction => string.Equals(
		GetHostEnvironmentName(),
		"Production",
		StringComparison.OrdinalIgnoreCase
	);
	public string EnvironmentName => GetHostEnvironmentName();
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
		bool diManifestEnabled
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
				diManifestEnabled: GetOptionalBool(nameof(DI_MANIFEST_ENABLED), false)
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

	private static string GetHostEnvironmentName() =>
		Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
		?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
		?? "Production";

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

		var isDevelopment = string.Equals(GetHostEnvironmentName(), "Development", StringComparison.OrdinalIgnoreCase);
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
	}

	private static string? FindDotEnvPath(string fileName) {
		// We intentionally search parent directories because the current working directory can vary:
		// - `dotnet run` often uses `apps/api/`
		// - build-time OpenAPI generation can execute from `apps/api/bin/...` or another working dir
		// Walking up ensures we can find the repo-root `.env.development` reliably.
		var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
		while (directory is not null) {
			var candidate = Path.Combine(directory.FullName, fileName);
			if (File.Exists(candidate)) return candidate;
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

		RuleFor(x => x.SESSION_TOKEN_HEADER_KEY)
			.Must(BeValidHeaderName)
			.WithMessage("SESSION_TOKEN_HEADER_KEY must be a valid HTTP header name");

		RuleFor(x => x.TENANT_ID_HEADER_KEY)
			.Must(BeValidHeaderName)
			.WithMessage("TENANT_ID_HEADER_KEY must be a valid HTTP header name");
	}

	private static bool BeValidUrl(string url) =>
		Uri.TryCreate(url, UriKind.Absolute, out var uri)
		&& (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
		&& !string.IsNullOrWhiteSpace(uri.Host)
		&& string.IsNullOrEmpty(uri.UserInfo)
		&& uri.AbsolutePath is "/"
		&& string.IsNullOrEmpty(uri.Query)
		&& string.IsNullOrEmpty(uri.Fragment);

	private static bool BeValidHeaderName(string headerName) =>
		!string.IsNullOrWhiteSpace(headerName)
		&& headerName.All(c => char.IsLetterOrDigit(c) || c == '-');

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
