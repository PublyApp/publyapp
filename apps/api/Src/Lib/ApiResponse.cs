namespace MainApi.Src.Lib;

/// <summary>
/// Represents an API response with a message and a type-safe translation key
/// </summary>
/// <param name="Message">The message (usually in English for debugging)</param>
/// <param name="Key">The translation key for frontend localization</param>
public record ApiResponse
{
	public string Message { get; set; } = string.Empty;
	public string Key { get; set; } = string.Empty;

	/// <summary>
	/// Creates an API response with a message and translation key
	/// </summary>
	/// <param name="message">The debug/fallback message</param>
	/// <param name="key">The type-safe translation key</param>
	/// <returns>A new ApiResponse</returns>
	public static ApiResponse Create(string message, TranslationKey key) => new() { Message = message, Key = key };
}
