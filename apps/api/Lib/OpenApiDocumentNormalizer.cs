using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace PublyApp.Api.Lib;

public sealed class OpenApiDocumentNormalizer : IOpenApiDocumentTransformer {
	public Task TransformAsync(
		OpenApiDocument document,
		OpenApiDocumentTransformerContext context,
		CancellationToken cancellationToken
	) {
		Normalize(document);

		return Task.CompletedTask;
	}

	public static void Normalize(OpenApiDocument document) {
		if (document.Info is not null) {
			document.Info.Description = NormalizeNewlines(document.Info.Description);
		}

		var visitedSchemas = new HashSet<IOpenApiSchema>();

		if (document.Components?.Schemas is not null) {
			foreach (var schema in document.Components.Schemas.Values) {
				NormalizeSchema(schema, visitedSchemas);
			}
		}

		if (document.Paths is null) {
			return;
		}

		foreach (var path in document.Paths) {
			var pathItem = path.Value;
			if (pathItem is null) {
				continue;
			}

			pathItem.Description = NormalizeNewlines(pathItem.Description);
			SortParameters(pathItem.Parameters, path.Key);
			NormalizeParameters(pathItem.Parameters, visitedSchemas);

			if (pathItem.Operations is null) {
				continue;
			}

			foreach (var operation in pathItem.Operations.Values) {
				if (operation is null) {
					continue;
				}

				operation.Description = NormalizeNewlines(operation.Description);
				SortParameters(operation.Parameters, path.Key);
				NormalizeParameters(operation.Parameters, visitedSchemas);
			}
		}
	}

	private static void SortParameters(IList<IOpenApiParameter>? parameters, string path) {
		if (parameters is null
			|| parameters.Count < 2) {
			return;
		}

		var orderedParameters = parameters
			.Select((parameter, index) => new {
				Parameter = parameter,
				OriginalIndex = index,
			})
			.OrderBy(item => GetParameterLocationOrder(item.Parameter.In))
			.ThenBy(item => GetPathParameterIndex(path, item.Parameter))
			.ThenBy(item => item.Parameter.Name ?? string.Empty, StringComparer.Ordinal)
			.ThenBy(item => item.OriginalIndex)
			.Select(item => item.Parameter)
			.ToList();

		parameters.Clear();

		foreach (var parameter in orderedParameters) {
			parameters.Add(parameter);
		}
	}

	private static int GetParameterLocationOrder(ParameterLocation? location) {
		return location switch {
			ParameterLocation.Path => 0,
			ParameterLocation.Query => 1,
			ParameterLocation.Header => 2,
			ParameterLocation.Cookie => 3,
			_ => 4,
		};
	}

	private static int GetPathParameterIndex(string path, IOpenApiParameter parameter) {
		if (parameter.In != ParameterLocation.Path
			|| string.IsNullOrEmpty(parameter.Name)) {
			return int.MaxValue;
		}

		var token = "{" + parameter.Name + "}";
		var tokenIndex = path.IndexOf(token, StringComparison.Ordinal);

		return tokenIndex >= 0 ? tokenIndex : int.MaxValue;
	}

	private static void NormalizeParameters(
		IEnumerable<IOpenApiParameter>? parameters,
		HashSet<IOpenApiSchema> visitedSchemas
	) {
		if (parameters is null) {
			return;
		}

		foreach (var parameter in parameters) {
			parameter.Description = NormalizeNewlines(parameter.Description);
			NormalizeSchema(parameter.Schema, visitedSchemas);
		}
	}

	private static void NormalizeSchema(
		IOpenApiSchema? schema,
		HashSet<IOpenApiSchema> visitedSchemas
	) {
		if (schema is null
			|| !visitedSchemas.Add(schema)) {
			return;
		}

		schema.Description = NormalizeNewlines(schema.Description);

		NormalizeSchema(schema.Not, visitedSchemas);
		NormalizeSchema(schema.Items, visitedSchemas);
		NormalizeSchema(schema.AdditionalProperties, visitedSchemas);

		if (schema.AllOf is not null) {
			foreach (var childSchema in schema.AllOf) {
				NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.OneOf is not null) {
			foreach (var childSchema in schema.OneOf) {
				NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.AnyOf is not null) {
			foreach (var childSchema in schema.AnyOf) {
				NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.Properties is not null) {
			foreach (var childSchema in schema.Properties.Values) {
				NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.PatternProperties is not null) {
			foreach (var childSchema in schema.PatternProperties.Values) {
				NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.Definitions is not null) {
			foreach (var childSchema in schema.Definitions.Values) {
				NormalizeSchema(childSchema, visitedSchemas);
			}
		}
	}

	private static string? NormalizeNewlines(string? value) {
		if (value is null) {
			return null;
		}

		return value
			.Replace("\r\n", "\n", StringComparison.Ordinal)
			.Replace("\r", "\n", StringComparison.Ordinal);
	}
}
