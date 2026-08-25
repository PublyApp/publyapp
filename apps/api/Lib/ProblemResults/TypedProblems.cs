using PublyApp.Api.Localization;

namespace PublyApp.Api.Lib.ProblemResults;

/// <summary>
/// Factory methods for creating RFC 7807 ProblemDetails responses with translation keys.
/// These results auto-document in OpenAPI via IEndpointMetadataProvider.
///
/// Usage:
/// <code>
/// return TypedProblems.Forbidden("Access denied", ResponseKeys.Forbidden);
/// return TypedProblems.NotFound("User not found", ResponseKeys.NotFound);
/// </code>
/// </summary>
public static class TypedProblems {
	/// <summary>
	/// Creates a 400 Bad Request response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Bad Request")</param>
	public static AppBadRequestHttpResult BadRequest(
		string detail,
		TranslationKey translationKey,
		string title = "Bad Request"
	) {
		return new(AppProblemDetails.Create(
		StatusCodes.Status400BadRequest,
		title,
		detail,
		translationKey
	));
	}

	/// <summary>
	/// Creates a 401 Unauthorized response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Unauthorized")</param>
	public static AppUnauthorizedHttpResult Unauthorized(
		string detail,
		TranslationKey translationKey,
		string title = "Unauthorized"
	) {
		return new(AppProblemDetails.Create(
		StatusCodes.Status401Unauthorized,
		title,
		detail,
		translationKey
	));
	}

	/// <summary>
	/// Creates a 403 Forbidden response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Forbidden")</param>
	public static AppForbiddenHttpResult Forbidden(
		string detail,
		TranslationKey translationKey,
		string title = "Forbidden"
	) {
		return new(AppProblemDetails.Create(
		StatusCodes.Status403Forbidden,
		title,
		detail,
		translationKey
	));
	}

	/// <summary>
	/// Creates a 404 Not Found response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Not Found")</param>
	public static AppNotFoundHttpResult NotFound(
		string detail,
		TranslationKey translationKey,
		string title = "Not Found"
	) {
		return new(AppProblemDetails.Create(
		StatusCodes.Status404NotFound,
		title,
		detail,
		translationKey
	));
	}

	/// <summary>
	/// Creates a 409 Conflict response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Conflict")</param>
	public static AppConflictHttpResult Conflict(
		string detail,
		TranslationKey translationKey,
		string title = "Conflict"
	) {
		return new(AppProblemDetails.Create(
		StatusCodes.Status409Conflict,
		title,
		detail,
		translationKey
	));
	}

	/// <summary>
	/// Creates a 500 Internal Server Error response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Internal Server Error")</param>
	public static AppInternalServerErrorHttpResult InternalServerError(
		string detail,
		TranslationKey translationKey,
		string title = "Internal Server Error"
	) {
		return new(AppProblemDetails.Create(
		StatusCodes.Status500InternalServerError,
		title,
		detail,
		translationKey
	));
	}

	/// <summary>
	/// Creates a 413 Payload Too Large response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Payload Too Large")</param>
	public static AppPayloadTooLargeHttpResult PayloadTooLarge(
		string detail,
		TranslationKey translationKey,
		string title = "Payload Too Large"
	) {
		return new(AppProblemDetails.Create(
		StatusCodes.Status413PayloadTooLarge,
		title,
		detail,
		translationKey
	));
	}

	/// <summary>
	/// Creates a 429 Too Many Requests response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Too Many Requests")</param>
	public static AppTooManyRequestsHttpResult TooManyRequests(
		string detail,
		TranslationKey translationKey,
		string title = "Too Many Requests"
	) {
		return new(AppProblemDetails.Create(
			StatusCodes.Status429TooManyRequests,
			title,
			detail,
			translationKey
	));
	}

	/// <summary>
	/// Creates a 422 Unprocessable Entity response with validation errors
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="errors">Dictionary of field names to error messages</param>
	public static AppValidationProblemHttpResult ValidationProblem(
		string detail,
		TranslationKey translationKey,
		IDictionary<string, string[]> errors
	) {
		return new(ValidationProblemDetails.Create(detail, translationKey, errors));
	}

	/// <summary>
	/// Creates a 503 Service Unavailable response for a downstream provider outage.
	/// Reserved for transient upstream failures (e.g. Bluesky unreachable) — safe to
	/// retry; never used for validation or auth failures.
	/// </summary>
	public static AppProviderUnavailableHttpResult ProviderUnavailable(
		string detail,
		TranslationKey translationKey,
		string title = "Provider Unavailable"
	) {
		return new(AppProblemDetails.Create(
		StatusCodes.Status503ServiceUnavailable,
		title,
		detail,
		translationKey
	));
	}
}
