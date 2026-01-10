using System.Text.RegularExpressions;

using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;

using Microsoft.AspNetCore.Diagnostics;

namespace MainApi.Src.Lib.Extensions;

public static class CustomExceptionHandler {
	public static void UseCustomExceptionHandler(this IApplicationBuilder app) {
		app.UseExceptionHandler(exceptionHandlerApp => {
			exceptionHandlerApp.Run(async context => {
				context.Response.ContentType = "application/problem+json";

				var statusCode = StatusCodes.Status500InternalServerError;
				var title = "Internal Server Error";
				var detail = "Internal server error";
				var key = ResponseKeys.InternalServerError;

				var exceptionHandlerFeature = context.Features.Get<IExceptionHandlerFeature>();
				var exceptionType = exceptionHandlerFeature?.Error;

				if (exceptionType != null) {
					if (
							exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException badRequestException
							&& badRequestException.Message.Contains("Required parameter")
							&& badRequestException.Message.Contains("was not provided from body")
						) {
						statusCode = StatusCodes.Status400BadRequest;
						title = "Bad Request";
						detail = "Request body is missing";
						key = ResponseKeys.RequestBodyMissing;
					}

					if (exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException validationException
						&& validationException.Message.Contains("Required parameter")
						&& validationException.Message.Contains("was not provided from query string")
					) {
						// Required parameter "string userId" was not provided from query string.
						var pattern = @"Required parameter ""string (\w+)"" was not provided";
						var match = Regex.Match(validationException.Message, pattern);
						var parameterName = match.Success ? match.Groups[1].Value : "unknown";

						statusCode = StatusCodes.Status400BadRequest;
						title = "Bad Request";
						detail = $"Query parameter '{parameterName}' is missing";
						key = ResponseKeys.QueryParametersMissing;
					}
				}

				context.Response.StatusCode = statusCode;

				var response = AppProblemDetails.Create(statusCode, title, detail, key);
				response.Instance = context.Request.Path.Value;
				response.Extensions["traceId"] = context.TraceIdentifier;

				await context.Response.WriteAsJsonAsync(response, context.RequestAborted);
			});
		});
	}
}
