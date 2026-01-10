using System.Reflection;

using Microsoft.AspNetCore.Http.Metadata;

namespace MainApi.Src.Lib.ProblemResults;

/// <summary>
/// A 422 Unprocessable Entity result with ValidationProblemDetails body.
/// Auto-documents in OpenAPI via IEndpointMetadataProvider.
/// Used specifically for validation errors with field-level details.
/// </summary>
public sealed class AppValidationProblemHttpResult : IResult, IEndpointMetadataProvider {
	private readonly ValidationProblemDetails _problemDetails;

	internal AppValidationProblemHttpResult(ValidationProblemDetails problemDetails) {
		_problemDetails = problemDetails;
	}

	public async Task ExecuteAsync(HttpContext httpContext) {
		_problemDetails.Instance ??= httpContext.Request.Path.Value;
		_problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

		httpContext.Response.StatusCode = StatusCodes.Status422UnprocessableEntity;
		httpContext.Response.ContentType = "application/problem+json";
		await httpContext.Response.WriteAsJsonAsync(_problemDetails, httpContext.RequestAborted);
	}

	/// <summary>
	/// Provides OpenAPI metadata for this result type
	/// </summary>
	public static void PopulateMetadata(MethodInfo method, EndpointBuilder builder) {
		builder.Metadata.Add(new ProducesValidationProblemMetadata());
	}
}
