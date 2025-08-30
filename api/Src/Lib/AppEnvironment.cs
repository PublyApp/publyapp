namespace MainApi.Src.Lib;

using FluentValidation;

public static class AppEnvironment
{
	public static string MONGODB_URI { get { return GetEnvVar(nameof(_MONGODB_URI)); } }
	private static string _MONGODB_URI = string.Empty;

	public static string MONGODB_DATABASE_NAME { get { return GetEnvVar(nameof(_MONGODB_DATABASE_NAME)); } }
	private static string _MONGODB_DATABASE_NAME = string.Empty;

	public static string FRONT_URL { get { return GetEnvVar(nameof(_FRONT_URL)); } }
	private static string _FRONT_URL = string.Empty;

	private static bool IS_DOTENV_LOADED = false;
	private static bool IS_INITIALIZED = false;
	private static readonly EnvironmentValidator _validator = new EnvironmentValidator();

	private static string GetEnvVar(string name)
	{
		if (!IS_INITIALIZED)
		{
			throw new Exception("Environment is not initialized: call AppEnvironment.LoadEnv() first");
		}

		var property = typeof(AppEnvironment).GetField(name, System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

		if (property == null)
		{
			throw new Exception($"Environment variable {name} is not supported by {nameof(AppEnvironment)}");
		}

		return property.GetValue(null) as string ?? string.Empty;
	}

	public static void LoadEnv()
	{
		if (IS_INITIALIZED) return;
		LoadDotEnv();
		ValidateAndSetEnvironmentVariables();
		IS_INITIALIZED = true;
	}

	private static void LoadDotEnv()
	{
		if (IS_DOTENV_LOADED) return;
		string path = Path.Combine(Directory.GetCurrentDirectory(), ".env.local");
		DotNetEnv.Env.Load(path);
		IS_DOTENV_LOADED = true;
	}

	private static void ValidateAndSetEnvironmentVariables()
	{
		var mongoDbUri = Environment.GetEnvironmentVariable(nameof(MONGODB_URI));
		var mongoDbDatabaseName = Environment.GetEnvironmentVariable(nameof(MONGODB_DATABASE_NAME));
		var frontUrl = Environment.GetEnvironmentVariable(nameof(FRONT_URL));

		var validationResult = _validator.Validate(new EnvironmentConfig
		{
			MongoDbUri = mongoDbUri,
			MongoDbDatabaseName = mongoDbDatabaseName,
			FrontUrl = frontUrl
		});

		if (!validationResult.IsValid)
		{
			var errors = string.Join(",\n\t\t", validationResult.Errors.Select(e => e.ErrorMessage));
			throw new Exception($"Environment validation failed:\n\t\t{errors}");
		}

		_MONGODB_URI = mongoDbUri!;
		_MONGODB_DATABASE_NAME = mongoDbDatabaseName!;
		_FRONT_URL = frontUrl!;
	}
}

public class EnvironmentConfig
{
	public string? MongoDbUri { get; set; }
	public string? MongoDbDatabaseName { get; set; }
	public string? FrontUrl { get; set; }
}

public class EnvironmentValidator : AbstractValidator<EnvironmentConfig>
{
	public EnvironmentValidator()
	{
		RuleFor(x => x.MongoDbUri)
			.NotEmpty().WithMessage("MONGODB_URI is not set or is empty")
			.Must(BeValidMongoDbUri).WithMessage("MONGODB_URI must be a valid MongoDB URI (mongodb:// or mongodb+srv://)");

		RuleFor(x => x.MongoDbDatabaseName)
			.NotEmpty().WithMessage("MONGODB_DATABASE_NAME is not set or is empty")
			.MaximumLength(64).WithMessage("MONGODB_DATABASE_NAME cannot exceed 64 characters")
			.Must(BeValidDatabaseName).WithMessage("MONGODB_DATABASE_NAME contains invalid characters or is a reserved word");

		RuleFor(x => x.FrontUrl)
			.NotEmpty().WithMessage("FRONT_URL is not set or is empty")
			.Must(BeAValidUrl).WithMessage("FRONT_URL must be a valid URL");
	}

	private static bool BeAValidUrl(string? url)
	{
		if (string.IsNullOrWhiteSpace(url))
		{
			return false; // Or handle as per your requirements (e.g., use NotEmpty)
		}
		return Uri.TryCreate(url, UriKind.Absolute, out Uri? result)
			&& (result.Scheme == Uri.UriSchemeHttp || result.Scheme == Uri.UriSchemeHttps);
	}

	private static bool BeValidMongoDbUri(string? uri)
	{
		if (string.IsNullOrWhiteSpace(uri)) return false;

		if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsedUri))
			return false;

		if (parsedUri.Scheme != "mongodb" && parsedUri.Scheme != "mongodb+srv")
			return false;

		return !string.IsNullOrWhiteSpace(parsedUri.Host);
	}

	private static bool BeValidDatabaseName(string? databaseName)
	{
		if (string.IsNullOrWhiteSpace(databaseName)) return false;

		// MongoDB database name restrictions
		var invalidChars = new[] { '/', '\\', '.', ' ', '"', '$', '*', '<', '>', ':', '|', '?' };
		if (invalidChars.Any(c => databaseName.Contains(c)))
			return false;

		// Cannot start with reserved words
		var reservedWords = new[] { "admin", "local", "config" };
		if (reservedWords.Contains(databaseName.ToLower()))
			return false;

		return true;
	}
}
