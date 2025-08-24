using Microsoft.AspNetCore.Diagnostics;

namespace MainApi.Src.Lib.Extensions;

public static class CustomExceptionHandler
{
	public static void UseCustomExceptionHandler(this WebApplication app)
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
							if (exceptionType is Microsoft.AspNetCore.Http.BadHttpRequestException badRequestException &&
													 badRequestException.Message.Contains("Required parameter") &&
													 badRequestException.Message.Contains("was not provided from body"))
							{
								message = "Request body is missing";
								key = "request-body-missing";
								context.Response.StatusCode = StatusCodes.Status400BadRequest;
							}
						}

						var response = new { message, key };
						await context.Response.WriteAsJsonAsync(response);
					});
		});
	}
}
