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

	public static void LoadEnv() {
		if (IS_INITIALIZED) return;
		LoadDotEnv();
		ValidateAndSetEnvironmentVariables();
		IS_INITIALIZED = true;
	}

	private static void LoadDotEnv() {
		if (IS_DOTENV_LOADED) return;
		if (IsDevelopment()) {
			// * relative to the api project (Program.cs)
			string path = Path.Combine(Directory.GetCurrentDirectory(), "../../.env.development");
			DotNetEnv.Env.Load(path);
		}
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
			.Must(BeAValidUrl).WithMessage("FRONT_URL must be a valid URL");

		RuleFor(x => x.ResendApiKey)
			.NotEmpty().WithMessage("RESEND_API_KEY is not set or is empty");

		RuleFor(x => x.StaffOwnerEmail)
			.NotEmpty().WithMessage("STAFF_OWNER_EMAIL is not set or is empty")
			.EmailAddress().WithMessage("STAFF_OWNER_EMAIL must be a valid email address");

		RuleFor(x => x.StaffOwnerBootstrapCode)
			.NotEmpty().WithMessage("STAFF_OWNER_BOOTSTRAP_CODE is not set or is empty");
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
