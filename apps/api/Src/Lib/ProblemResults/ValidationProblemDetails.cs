using System.Text.Json.Serialization;

namespace MainApi.Src.Lib.ProblemResults;

/// <summary>
/// A ProblemDetails extension for validation errors.
/// Includes field-level errors in addition to the translation key.
/// Complies with RFC 7807 while supporting validation error details.
/// </summary>
public class ValidationProblemDetails : AppProblemDetails {
	/// <summary>
	/// Dictionary of field names to error messages.
	/// Serialized as "errors" in the JSON response.
	/// </summary>
	[JsonPropertyName("errors")]
	public IDictionary<string, string[]> Errors { get; set; } = new Dictionary<string, string[]>();

	/// <summary>
	/// Creates a ValidationProblemDetails with the specified values
	/// </summary>
	/// <param name="detail">Detailed explanation (e.g., "Request body validation failed")</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="errors">Dictionary of field names to error messages</param>
	public static ValidationProblemDetails Create(
		string detail,
		TranslationKey translationKey,
		IDictionary<string, string[]> errors
	) => new() {
		Status = StatusCodes.Status422UnprocessableEntity,
		Title = "Validation Failed",
		Detail = detail,
		TranslationKey = translationKey.Value,
		Type = "https://httpstatuses.com/422",
		Errors = errors
	};
}
