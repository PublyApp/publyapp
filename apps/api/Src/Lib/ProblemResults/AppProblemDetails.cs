using System.Text.Json.Serialization;

using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Lib.ProblemResults;

/// <summary>
/// A ProblemDetails extension that includes a translation key for frontend i18n.
/// Complies with RFC 7807 while supporting localization.
/// </summary>
public class AppProblemDetails : ProblemDetails {
	/// <summary>
	/// The translation key for frontend localization.
	/// Serialized as "translationKey" in the JSON response.
	/// </summary>
	[JsonPropertyName("translationKey")]
	public string TranslationKey { get; set; } = string.Empty;

	/// <summary>
	/// Creates a AppProblemDetails with the specified values
	/// </summary>
	/// <param name="statusCode">HTTP status code</param>
	/// <param name="title">Short human-readable summary</param>
	/// <param name="detail">Detailed explanation</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="type">URI reference identifying the problem type (optional)</param>
	/// <param name="instance">URI reference identifying the specific occurrence (optional)</param>
	public static AppProblemDetails Create(
		int statusCode,
		string title,
		string detail,
		TranslationKey translationKey,
		string? type = null,
		string? instance = null
	) => new() {
		Status = statusCode,
		Title = title,
		Detail = detail,
		TranslationKey = translationKey.Value,
		Type = type ?? $"https://httpstatuses.com/{statusCode}",
		Instance = instance
	};
}
