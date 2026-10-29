using System.Text.Json;
using System.Text.RegularExpressions;

using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.WebUtilities;

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
	private static partial Regex _MissingQueryParameterPattern();

	// System.Text.Json's message for a JSON body that omits a `required` member:
	//   JSON deserialization for type 'X' was missing required properties including: 'Body'.
	//   JSON deserialization for type 'X' was missing required properties including: 'Id', 'Token'.
	[GeneratedRegex(@"was missing required properties including:\s*(?<names>.+)$")]
	private static partial Regex _MissingRequiredBodyPropertiesPattern();

	[GeneratedRegex("'([^']+)'")]
	private static partial Regex _QuotedPropertyNamePattern();

	/// <summary>
	/// FluentValidation keys `errors` by CLR property name; System.Text.Json
	/// reports the camelCase wire name. PascalCase restores the validator key.
	/// </summary>
	private static string _ToValidatorKey(string wireName) {
		// ponytail: first-char PascalCase only — every request-body DTO in this
		// repo maps its JSON member to the head-cased CLR name. A DTO carrying an
		// explicit [JsonPropertyName] with a different shape would need the real
		// property lookup instead.
		return char.ToUpperInvariant(wireName[0]) + wireName[1..];
	}

	/// <summary>
	/// Maps an unhandled exception caught by the global handler to the RFC 7807
	/// response it should produce. Extracted as a pure function (no HttpContext
	/// dependency) so each branch — in particular the Kestrel request-size-limit
	/// 413, the JSON body that omits a <c>required</c> member, and the two
	/// ASP.NET Core "Required parameter ... was not provided" shapes — can be
	/// unit-tested directly instead of relying on TestServer to reproduce
	/// conditions (a body-size trip, a malformed binder message) it cannot
	/// reliably trigger.
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

		// A JSON body that omits a `required` member never reaches FluentValidation:
		// the request delegate fails to bind the body first and raises a 400-shaped
		// BadHttpRequestException. Answer with the same 422 + `errors` keys the
		// validator path uses (`Body`, `TimeZone`, ...) so the client gets a field
		// name instead of a bare 400 (#2261).
		if (
				exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException requiredMemberException
				&& requiredMemberException.InnerException is JsonException requiredMemberJsonException
				&& CustomExceptionHandler._MissingRequiredBodyPropertiesPattern().Match(
					requiredMemberJsonException.Message
				) is { Success: true } missingMatch
			) {
			var errors = new Dictionary<string, string[]>();
			foreach (Match nameMatch in CustomExceptionHandler._QuotedPropertyNamePattern().Matches(
				missingMatch.Groups["names"].Value
			)) {
				// The message names the JSON wire member (`body`); FluentValidation's
				// ToDictionary() keys the CLR property (`Body`). PascalCase the wire
				// name so both failure paths hand the client the same stable key.
				var propertyName = CustomExceptionHandler._ToValidatorKey(nameMatch.Groups[1].Value);
				errors[propertyName] = [$"{propertyName} is required"];
			}

			return new ExceptionMapping(
				StatusCodes.Status422UnprocessableEntity,
				"Validation Failed",
				"Request body validation failed",
				ResponseKeys.RequestBodyValidationFailed,
				errors
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
			var match = CustomExceptionHandler._MissingQueryParameterPattern().Match(validationException.Message);
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

		// Any other unreadable request (malformed JSON, a non-JSON content type, an
		// unbindable route/query value) carries its own 4xx status. Answer it as
		// RFC 7807 instead of letting the generic 500 branch swallow it.
		if (
				exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException { StatusCode: >= 400 and < 500 } unreadableRequestException
			) {
			var detail = unreadableRequestException.InnerException is JsonException jsonException
				? jsonException.Message
				: unreadableRequestException.Message;

			return new ExceptionMapping(
				unreadableRequestException.StatusCode,
				ReasonPhrases.GetReasonPhrase(unreadableRequestException.StatusCode),
				detail,
				ResponseKeys.BadRequest,
				null
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

				var mapped = CustomExceptionHandler.MapException(exceptionType);

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

				// Serialize the RUNTIME type: WriteAsJsonAsync<T> would use the
				// AppProblemDetails static type and drop ValidationProblemDetails'
				// `errors` object, leaving a 422 with no field errors on the wire.
				await context.Response.WriteAsJsonAsync(
					(object)response,
					options: null,
					contentType: "application/problem+json",
					cancellationToken: context.RequestAborted
				);
			});
		});
	}
}
