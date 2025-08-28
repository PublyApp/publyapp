namespace MainApi.Src.Lib;

using System.ComponentModel.DataAnnotations;

// Configuration class for strongly-typed settings
public class AppSettings
{
	[Required(ErrorMessage = "SESSION_EXPIRY_DAYS is required in appsettings.json")]
	[Range(1, 365, ErrorMessage = "SESSION_EXPIRY_DAYS must be between 1 and 365")]
	public int SESSION_EXPIRY_DAYS { get; set; }
}
