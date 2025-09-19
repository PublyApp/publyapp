namespace MainApi.Src.Lib;

using System.ComponentModel.DataAnnotations;

// Configuration class for strongly-typed settings
public class AppSettings {
	[Required(ErrorMessage = "SESSION_EXPIRY_DAYS is required in appsettings.json::AppSettings")]
	[Range(1, 365, ErrorMessage = "SESSION_EXPIRY_DAYS must be between 1 and 365")]
	public int SESSION_EXPIRY_DAYS { get; set; }

	[Required(ErrorMessage = "SESSION_TOKEN_HEADER_KEY is required in appsettings.json::AppSettings")]
	public string SESSION_TOKEN_HEADER_KEY { get; set; } = string.Empty;

	[Required(ErrorMessage = "EMAIL_VERIFY_TOKEN_VALIDITY_DURATION is required in appsettings.json::AppSettings")]
	[Range(1, 365, ErrorMessage = "EMAIL_VERIFY_TOKEN_VALIDITY_DURATION must be between 1 and 365")]
	public int EMAIL_VERIFY_TOKEN_VALIDITY_DURATION { get; set; }

	public readonly string STAFF_TENANT_CODE = "staff";
}
