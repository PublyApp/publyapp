using Microsoft.AspNetCore.Diagnostics;
using System.Text.RegularExpressions;

namespace MainApi.Src.Lib.Extensions;

public static class CustomExceptionHandler
{
	public static void UseCustomExceptionHandler(this IApplicationBuilder app)
	{
		app.UseExceptionHandler(exceptionHandlerApp =>
		{
			exceptionHandlerApp.Run(async context =>
					{
						context.Response.ContentType = "application/json";
						context.Response.StatusCode = StatusCodes.Status500InternalServerError;

						var message = "Internal server error";
						var key = "internal-server-error";

						var exceptionHandlerFeature = context.Features.Get<IExceptionHandlerFeature>();
						var exceptionType = exceptionHandlerFeature?.Error;

						if (exceptionType != null)
						{
							if (
									exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException badRequestException
									&& badRequestException.Message.Contains("Required parameter")
									&& badRequestException.Message.Contains("was not provided from body")
								)
							{
								message = "Request body is missing";
								key = "request-body-missing";
								context.Response.StatusCode = StatusCodes.Status400BadRequest;
							}

							if (exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException validationException
								&& validationException.Message.Contains("Required parameter")
								&& validationException.Message.Contains("was not provided from query string")
							)
							{
								// Required parameter "string userId" was not provided from query string.
								var pattern = @"Required parameter ""string (\w+)"" was not provided";
								var match = Regex.Match(validationException.Message, pattern);
								var parameterName = match.Success ? match.Groups[1].Value : "unknown";

								message = $"Query parameter '{parameterName}' is missing";
								key = "query-parameter-missing";
								context.Response.StatusCode = StatusCodes.Status400BadRequest;
							}
						}

						var response = new { message, key };
						await context.Response.WriteAsJsonAsync(response);
					});
		});
	}
}
