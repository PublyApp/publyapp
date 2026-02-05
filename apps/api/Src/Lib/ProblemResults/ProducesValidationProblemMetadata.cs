using Microsoft.AspNetCore.Http.Metadata;

namespace MainApi.Src.Lib.ProblemResults;

/// <summary>
/// Metadata describing a ValidationProblemDetails response for OpenAPI documentation.
/// Used by validation filters to document the 422 response with the errors dictionary.
/// </summary>
internal sealed class ProducesValidationProblemMetadata : IProducesResponseTypeMetadata {
	public Type? Type => typeof(ValidationProblemDetails);
	public int StatusCode => StatusCodes.Status422UnprocessableEntity;
	public IEnumerable<string> ContentTypes { get; } = ["application/problem+json"];
}
