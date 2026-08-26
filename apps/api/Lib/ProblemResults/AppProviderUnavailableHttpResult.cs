using System.Reflection;

using Microsoft.AspNetCore.Http.Metadata;

namespace PublyApp.Api.Lib.ProblemResults;

/// <summary>
/// A 503 Service Unavailable result with AppProblemDetails body, reserved for a
/// downstream provider being unreachable (transient outage — safe to retry).
/// Auto-documents in OpenAPI via IEndpointMetadataProvider.
/// </summary>
public sealed class AppProviderUnavailableHttpResult : IResult, IEndpointMetadataProvider {
	private readonly AppProblemDetails _problemDetails;

	internal AppProviderUnavailableHttpResult(AppProblemDetails problemDetails) {
		_problemDetails = problemDetails;
	}

	public async Task ExecuteAsync(HttpContext httpContext) {
		_problemDetails.Instance ??= httpContext.Request.Path.Value;
		_problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

		httpContext.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
		httpContext.Response.ContentType = "application/problem+json";
		await httpContext.Response.WriteAsJsonAsync(
			_problemDetails,
			options: null,
			contentType: "application/problem+json",
			cancellationToken: httpContext.RequestAborted
		);
	}

	/// <summary>
	/// Provides OpenAPI metadata for this result type
	/// </summary>
	public static void PopulateMetadata(MethodInfo method, EndpointBuilder builder) {
		builder.Metadata.Add(
			new ProducesAppProblemMetadata(StatusCodes.Status503ServiceUnavailable)
		);
	}
}
