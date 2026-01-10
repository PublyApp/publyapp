using System.Reflection;

using Microsoft.AspNetCore.Http.Metadata;

namespace MainApi.Src.Lib.ProblemResults;

/// <summary>
/// A 404 Not Found result with AppProblemDetails body.
/// Auto-documents in OpenAPI via IEndpointMetadataProvider.
/// </summary>
public sealed class NotFoundHttpResult : IResult, IEndpointMetadataProvider {
	private readonly AppProblemDetails _problemDetails;

	internal NotFoundHttpResult(AppProblemDetails problemDetails) {
		_problemDetails = problemDetails;
	}

	public async Task ExecuteAsync(HttpContext httpContext) {
		_problemDetails.Instance ??= httpContext.Request.Path.Value;
		_problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

		httpContext.Response.StatusCode = StatusCodes.Status404NotFound;
		httpContext.Response.ContentType = "application/problem+json";
		await httpContext.Response.WriteAsJsonAsync(_problemDetails, httpContext.RequestAborted);
	}

	/// <summary>
	/// Provides OpenAPI metadata for this result type
	/// </summary>
	public static void PopulateMetadata(MethodInfo method, EndpointBuilder builder) {
		builder.Metadata.Add(new ProducesAppProblemMetadata(StatusCodes.Status404NotFound));
	}
}
