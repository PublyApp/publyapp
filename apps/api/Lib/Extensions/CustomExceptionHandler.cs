using System.Text.RegularExpressions;

using Microsoft.AspNetCore.Diagnostics;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;

namespace PublyApp.Api.Lib.Extensions;

public static partial class CustomExceptionHandler {
	public readonly record struct ExceptionMapping(
		int StatusCode,
		string Title,
		string Detail,
		TranslationKey Key,
		IDictionary<string, string[]>? Errors
	);

	[GeneratedRegex(@"Required parameter ""string (\w+)"" was not provided")]
	private static partial Regex MissingQueryParameterPattern();

	/// <summary>
	/// Maps an unhandled exception caught by the global handler to the RFC 7807
	/// response it should produce. Extracted as a pure function (no HttpContext
	/// dependency) so each branch — in particular the Kestrel request-size-limit
	/// 413 and the two ASP.NET Core "Required parameter ... was not provided"
	/// shapes — can be unit-tested directly instead of relying on TestServer to
	/// reproduce conditions (a body-size trip, a malformed binder message) it
	/// cannot reliably trigger.
	/// </summary>
	public static ExceptionMapping MapException(Exception? exceptionType) {
		// Kestrel throws this when a request body exceeds the limit set by
		// RequestSizeLimitAttribute / FormOptions.MultipartBodyLengthLimit
		// (see UploadEndpointsForStaff), before the handler's own size check runs.
		if (
				exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException sizeLimitException
				&& sizeLimitException.StatusCode == StatusCodes.Status413PayloadTooLarge
			) {
			return new ExceptionMapping(
				StatusCodes.Status413PayloadTooLarge,
				"Payload Too Large",
				"Request body exceeds the maximum allowed size",
				ResponseKeys.UploadFileTooLarge,
				null
			);
		}

		if (
				exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException badRequestException
				&& badRequestException.Message.Contains("Required parameter")
				&& badRequestException.Message.Contains("was not provided from body")
			) {
			return new ExceptionMapping(
				StatusCodes.Status422UnprocessableEntity,
				"Validation Failed",
				"Request body is required",
				ResponseKeys.RequestBodyMissing,
				new Dictionary<string, string[]> {
					{ "body", ["Request body is required"] }
				}
			);
		}

		if (
				exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException validationException
				&& validationException.Message.Contains("Required parameter")
				&& validationException.Message.Contains("was not provided from query string")
			) {
			// Required parameter "string userId" was not provided from query string.
			var match = MissingQueryParameterPattern().Match(validationException.Message);
			var parameterName = match.Success ? match.Groups[1].Value : "unknown";

			return new ExceptionMapping(
				StatusCodes.Status422UnprocessableEntity,
				"Validation Failed",
				$"Query parameter '{parameterName}' is missing",
				ResponseKeys.QueryParametersMissing,
				new Dictionary<string, string[]> {
					{ parameterName, [$"Query parameter '{parameterName}' is required"] }
				}
			);
		}

		return new ExceptionMapping(
			StatusCodes.Status500InternalServerError,
			"Internal Server Error",
			"Internal server error",
			ResponseKeys.InternalServerError,
			null
		);
	}

	public static void UseCustomExceptionHandler(this IApplicationBuilder app) {
		app.UseExceptionHandler(exceptionHandlerApp => {
			exceptionHandlerApp.Run(async context => {
				var logger = context.RequestServices
					.GetRequiredService<ILoggerFactory>()
					.CreateLogger("CustomExceptionHandler");

				context.Response.ContentType = "application/problem+json";

				var exceptionHandlerFeature = context.Features.Get<IExceptionHandlerFeature>();
				var exceptionType = exceptionHandlerFeature?.Error;

				var mapped = MapException(exceptionType);

				if (exceptionType is not null) {
					if (mapped.StatusCode == StatusCodes.Status500InternalServerError) {
						logger.LogError(exceptionType, "Unhandled exception");
					} else if (logger.IsEnabled(LogLevel.Debug)) {
						logger.LogDebug(
							"Handled exception in global handler: {ExceptionType} {Message}",
							exceptionType.GetType().Name,
							exceptionType.Message
						);
					}
				}

				context.Response.StatusCode = mapped.StatusCode;

				AppProblemDetails response = mapped.Errors is not null
					? ValidationProblemDetails.Create(mapped.Detail, mapped.Key, mapped.Errors)
					: AppProblemDetails.Create(mapped.StatusCode, mapped.Title, mapped.Detail, mapped.Key);
				response.Instance = context.Request.Path.Value;
				response.Extensions["traceId"] = context.TraceIdentifier;

				await context.Response.WriteAsJsonAsync(response, context.RequestAborted);
			});
		});
	}
}
