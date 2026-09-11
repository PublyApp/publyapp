using System.Reflection;

using Microsoft.AspNetCore.Http.Metadata;

namespace PublyApp.Api.Lib.ProblemResults;

/// <summary>
/// A 401 Unauthorized result with AppProblemDetails body.
/// Auto-documents in OpenAPI via IEndpointMetadataProvider.
/// </summary>
public sealed class AppUnauthorizedHttpResult : IResult, IEndpointMetadataProvider {
	private readonly AppProblemDetails _ProblemDetails;

	internal AppUnauthorizedHttpResult(AppProblemDetails problemDetails) {
		_ProblemDetails = problemDetails;
	}

	public async Task ExecuteAsync(HttpContext httpContext) {
		_ProblemDetails.Instance ??= httpContext.Request.Path.Value;
		_ProblemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

		httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
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
		builder.Metadata.Add(new ProducesAppProblemMetadata(StatusCodes.Status401Unauthorized));
	}
}
