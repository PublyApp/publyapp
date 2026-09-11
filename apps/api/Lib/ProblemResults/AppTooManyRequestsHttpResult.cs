using System.Reflection;

using Microsoft.AspNetCore.Http.Metadata;

namespace PublyApp.Api.Lib.ProblemResults;

/// <summary>
/// A 429 Too Many Requests result with an AppProblemDetails body.
/// Auto-documents in OpenAPI via IEndpointMetadataProvider.
/// </summary>
public sealed class AppTooManyRequestsHttpResult
	: IResult, IEndpointMetadataProvider {
	private readonly AppProblemDetails _ProblemDetails;

	internal AppTooManyRequestsHttpResult(
		AppProblemDetails problemDetails
	) {
		_ProblemDetails = problemDetails;
	}

	public async Task ExecuteAsync(HttpContext httpContext) {
		_ProblemDetails.Instance ??=
			httpContext.Request.Path.Value;
		_ProblemDetails.Extensions["traceId"] =
			httpContext.TraceIdentifier;

		httpContext.Response.StatusCode =
			StatusCodes.Status429TooManyRequests;
		httpContext.Response.ContentType =
			"application/problem+json";
		await httpContext.Response.WriteAsJsonAsync(
			_ProblemDetails,
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
