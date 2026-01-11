using Microsoft.AspNetCore.Http.Metadata;

namespace MainApi.Src.Lib.ProblemResults;

/// <summary>
/// Metadata describing a AppProblemDetails response for OpenAPI documentation
/// </summary>
internal sealed class ProducesAppProblemMetadata : IProducesResponseTypeMetadata {
	public ProducesAppProblemMetadata(int statusCode) {
		StatusCode = statusCode;
	}

	public Type? Type => typeof(AppProblemDetails);
	public int StatusCode { get; }
	public IEnumerable<string> ContentTypes { get; } = ["application/problem+json"];
}
