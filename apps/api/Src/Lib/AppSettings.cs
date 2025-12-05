using System.ComponentModel.DataAnnotations;

namespace MainApi.Src.Lib;

// Configuration class for strongly-typed settings
public class AppSettings {
	[Required(ErrorMessage = "APP_NAME is required in appsettings.json::AppSettings")]
	public string APP_NAME { get; init; } = string.Empty;

	[Required(ErrorMessage = "DEFAULT_EMAIL_SENDER_EMAIL is required in appsettings.json::AppSettings")]
	public string DEFAULT_EMAIL_SENDER_EMAIL { get; init; } = string.Empty;

	[Required(ErrorMessage = "DEFAULT_EMAIL_SENDER_NAME is required in appsettings.json::AppSettings")]
	public string DEFAULT_EMAIL_SENDER_NAME { get; init; } = string.Empty;

	[Required(ErrorMessage = "SESSION_TOKEN_HEADER_KEY is required in appsettings.json::AppSettings")]
	public string SESSION_TOKEN_HEADER_KEY { get; init; } = string.Empty;

	[Required(ErrorMessage = "SESSION_EXPIRY_DAYS is required in appsettings.json::AppSettings")]
	[Range(1, 365, ErrorMessage = "SESSION_EXPIRY_DAYS must be between 1 and 365")]
	public int SESSION_EXPIRY_DAYS { get; init; }

	[Required(ErrorMessage = "EMAIL_VERIFY_TOKEN_VALIDITY_DURATION is required in appsettings.json::AppSettings")]
	[Range(1, 365, ErrorMessage = "EMAIL_VERIFY_TOKEN_VALIDITY_DURATION must be between 1 and 365")]
	public int EMAIL_VERIFY_TOKEN_VALIDITY_DURATION { get; init; }

	[Required(ErrorMessage = "PASSWORD_RESET_TOKEN_VALIDITY_DURATION is required in appsettings.json::AppSettings")]
	[Range(1, 365, ErrorMessage = "PASSWORD_RESET_TOKEN_VALIDITY_DURATION must be between 1 and 365")]
	public int PASSWORD_RESET_TOKEN_VALIDITY_DURATION { get; init; }

	[Required(ErrorMessage = "PASSWORD_MIN_LENGTH is required in appsettings.json::AppSettings")]
	[Range(1, 100, ErrorMessage = "PASSWORD_MIN_LENGTH must be between 1 and 100")]
	public int PASSWORD_MIN_LENGTH { get; init; }

	[Required(ErrorMessage = "EMAIL_VERIFY_TOKEN_LENGTH is required in appsettings.json::AppSettings")]
	[Range(25, int.MaxValue, ErrorMessage = "EMAIL_VERIFY_TOKEN_LENGTH must be between 25 and int.MaxValue")]
	public int EMAIL_VERIFY_TOKEN_LENGTH { get; init; }

	[Required(ErrorMessage = "PASSWORD_RESET_TOKEN_LENGTH is required in appsettings.json::AppSettings")]
	[Range(25, int.MaxValue, ErrorMessage = "PASSWORD_RESET_TOKEN_LENGTH must be between 25 and int.MaxValue")]
	public int PASSWORD_RESET_TOKEN_LENGTH { get; init; }

	[Required(ErrorMessage = "INVITATION_TOKEN_LENGTH is required in appsettings.json::AppSettings")]
	[Range(25, int.MaxValue, ErrorMessage = "INVITATION_TOKEN_LENGTH must be between 25 and int.MaxValue")]
	public int INVITATION_TOKEN_LENGTH { get; init; }

	public readonly int MAX_PROFILES_PER_USER = 5;

	public readonly int PAGINATION_DEFAULT_LIMIT = 100;

	public readonly int MAX_BULK_INVITATIONS_SIZE = 100;

	public static readonly int DEFAULT_MAX_USERS_PER_TENANT = 5;
}
