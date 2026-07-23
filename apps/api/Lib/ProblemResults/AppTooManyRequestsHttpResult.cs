using System.Reflection;

using Microsoft.AspNetCore.Http.Metadata;

namespace PublyApp.Api.Lib.ProblemResults;

/// <summary>
/// A 429 Too Many Requests result with an AppProblemDetails body.
/// Auto-documents in OpenAPI via IEndpointMetadataProvider.
/// </summary>
public sealed class AppTooManyRequestsHttpResult
	: IResult, IEndpointMetadataProvider {
	private readonly AppProblemDetails _problemDetails;

	internal AppTooManyRequestsHttpResult(
		AppProblemDetails problemDetails
	) {
		_problemDetails = problemDetails;
	}

	public async Task ExecuteAsync(HttpContext httpContext) {
		_problemDetails.Instance ??=
			httpContext.Request.Path.Value;
		_problemDetails.Extensions["traceId"] =
			httpContext.TraceIdentifier;

		httpContext.Response.StatusCode =
			StatusCodes.Status429TooManyRequests;
		httpContext.Response.ContentType =
			"application/problem+json";
		await httpContext.Response.WriteAsJsonAsync(
			_problemDetails,
			options: null,
			contentType: "application/problem+json",
			cancellationToken:
				httpContext.RequestAborted
		);
	}

	public static void PopulateMetadata(
		MethodInfo method,
		EndpointBuilder builder
	) {
		builder.Metadata.Add(
			new ProducesAppProblemMetadata(
				StatusCodes.Status429TooManyRequests
			)
		);
	}
}
