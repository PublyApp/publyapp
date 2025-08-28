using FluentValidation;

namespace MainApi.Src.Lib;


public static class AppEnvironment
{
	public static string MONGODB_URI { get { return GetEnvVar(nameof(_MONGODB_URI)); } }
	private static string _MONGODB_URI = string.Empty;

	public static string MONGODB_DATABASE_NAME { get { return GetEnvVar(nameof(_MONGODB_DATABASE_NAME)); } }
	private static string _MONGODB_DATABASE_NAME = string.Empty;

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

		var validationResult = _validator.Validate(new EnvironmentConfig
		{
			MongoDbUri = mongoDbUri,
			MongoDbDatabaseName = mongoDbDatabaseName
		});

		if (!validationResult.IsValid)
		{
			var errors = string.Join(",\n\t\t", validationResult.Errors.Select(e => e.ErrorMessage));
			throw new Exception($"Environment validation failed:\n\t\t{errors}");
		}

		_MONGODB_URI = mongoDbUri!;
		_MONGODB_DATABASE_NAME = mongoDbDatabaseName!;
	}
}

public class EnvironmentConfig
{
	public string? MongoDbUri { get; set; }
	public string? MongoDbDatabaseName { get; set; }
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
