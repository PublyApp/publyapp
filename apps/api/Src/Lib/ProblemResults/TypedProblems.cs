namespace MainApi.Src.Lib.ProblemResults;

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
	public static BadRequestHttpResult BadRequest(
		string detail,
		TranslationKey translationKey,
		string title = "Bad Request"
	) => new(AppProblemDetails.Create(
		StatusCodes.Status400BadRequest,
		title,
		detail,
		translationKey
	));

	/// <summary>
	/// Creates a 401 Unauthorized response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Unauthorized")</param>
	public static UnauthorizedHttpResult Unauthorized(
		string detail,
		TranslationKey translationKey,
		string title = "Unauthorized"
	) => new(AppProblemDetails.Create(
		StatusCodes.Status401Unauthorized,
		title,
		detail,
		translationKey
	));

	/// <summary>
	/// Creates a 403 Forbidden response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Forbidden")</param>
	public static ForbiddenHttpResult Forbidden(
		string detail,
		TranslationKey translationKey,
		string title = "Forbidden"
	) => new(AppProblemDetails.Create(
		StatusCodes.Status403Forbidden,
		title,
		detail,
		translationKey
	));

	/// <summary>
	/// Creates a 404 Not Found response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Not Found")</param>
	public static NotFoundHttpResult NotFound(
		string detail,
		TranslationKey translationKey,
		string title = "Not Found"
	) => new(AppProblemDetails.Create(
		StatusCodes.Status404NotFound,
		title,
		detail,
		translationKey
	));

	/// <summary>
	/// Creates a 500 Internal Server Error response with ProblemDetails
	/// </summary>
	/// <param name="detail">Detailed explanation of the error</param>
	/// <param name="translationKey">Translation key for frontend i18n</param>
	/// <param name="title">Short summary (defaults to "Internal Server Error")</param>
	public static InternalServerErrorHttpResult InternalServerError(
		string detail,
		TranslationKey translationKey,
		string title = "Internal Server Error"
	) => new(AppProblemDetails.Create(
		StatusCodes.Status500InternalServerError,
		title,
		detail,
		translationKey
	));
}
