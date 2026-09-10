using System.Reflection;

using Microsoft.AspNetCore.Http.Metadata;

namespace PublyApp.Api.Lib.ProblemResults;

/// <summary>
/// A 400 Bad Request result with AppProblemDetails body.
/// Auto-documents in OpenAPI via IEndpointMetadataProvider.
/// </summary>
public sealed class AppBadRequestHttpResult : IResult, IEndpointMetadataProvider {
	private readonly AppProblemDetails _ProblemDetails;

	internal AppBadRequestHttpResult(AppProblemDetails problemDetails) {
		_ProblemDetails = problemDetails;
	}

	public async Task ExecuteAsync(HttpContext httpContext) {
		_ProblemDetails.Instance ??= httpContext.Request.Path.Value;
		_ProblemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

		httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
		httpContext.Response.ContentType = "application/problem+json";
		await httpContext.Response.WriteAsJsonAsync(
			_ProblemDetails,
			options: null,
			contentType: "application/problem+json",
			cancellationToken: httpContext.RequestAborted
		);
	}

	/// <summary>
	/// Provides OpenAPI metadata for this result type
	/// </summary>
	public static void PopulateMetadata(MethodInfo method, EndpointBuilder builder) {
		builder.Metadata.Add(new ProducesAppProblemMetadata(StatusCodes.Status400BadRequest));
	}
}
