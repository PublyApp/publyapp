using System.Text.RegularExpressions;

using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;

using Microsoft.AspNetCore.Diagnostics;

namespace MainApi.Src.Lib.Extensions;

public static class CustomExceptionHandler {
	public static void UseCustomExceptionHandler(this IApplicationBuilder app) {
		app.UseExceptionHandler(exceptionHandlerApp => {
			exceptionHandlerApp.Run(async context => {
				var logger = context.RequestServices
					.GetRequiredService<ILoggerFactory>()
					.CreateLogger("CustomExceptionHandler");

				context.Response.ContentType = "application/problem+json";

				var statusCode = StatusCodes.Status500InternalServerError;
				var title = "Internal Server Error";
				var detail = "Internal server error";
				var key = ResponseKeys.InternalServerError;
				IDictionary<string, string[]>? errors = null;

				var exceptionHandlerFeature = context.Features.Get<IExceptionHandlerFeature>();
				var exceptionType = exceptionHandlerFeature?.Error;

				if (exceptionType != null) {
					if (
							exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException badRequestException
							&& badRequestException.Message.Contains("Required parameter")
							&& badRequestException.Message.Contains("was not provided from body")
						) {
						statusCode = StatusCodes.Status422UnprocessableEntity;
						title = "Validation Failed";
						detail = "Request body is required";
						key = ResponseKeys.RequestBodyMissing;
						errors = new Dictionary<string, string[]> {
							{ "body", ["Request body is required"] }
						};
					}

					if (exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException validationException
						&& validationException.Message.Contains("Required parameter")
						&& validationException.Message.Contains("was not provided from query string")
					) {
						// Required parameter "string userId" was not provided from query string.
						var pattern = @"Required parameter ""string (\w+)"" was not provided";
						var match = Regex.Match(validationException.Message, pattern);
						var parameterName = match.Success ? match.Groups[1].Value : "unknown";

						statusCode = StatusCodes.Status422UnprocessableEntity;
						title = "Validation Failed";
						detail = $"Query parameter '{parameterName}' is missing";
						key = ResponseKeys.QueryParametersMissing;
						errors = new Dictionary<string, string[]> {
							{ parameterName, [$"Query parameter '{parameterName}' is required"] }
						};
					}

					if (statusCode == StatusCodes.Status500InternalServerError) {
						logger.LogError(exceptionType, "Unhandled exception");
					} else if (logger.IsEnabled(LogLevel.Debug)) {
						logger.LogDebug(
							"Handled exception in global handler: {ExceptionType} {Message}",
							exceptionType.GetType().Name,
							exceptionType.Message
						);
					}
				}

				context.Response.StatusCode = statusCode;

				AppProblemDetails response = errors is not null
					? ValidationProblemDetails.Create(detail, key, errors)
					: AppProblemDetails.Create(statusCode, title, detail, key);
				response.Instance = context.Request.Path.Value;
				response.Extensions["traceId"] = context.TraceIdentifier;

				await context.Response.WriteAsJsonAsync(response, context.RequestAborted);
			});
		});
	}
}
