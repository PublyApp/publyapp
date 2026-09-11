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
			document.Info.Description = _NormalizeNewlines(document.Info.Description);
		}

		var visitedSchemas = new HashSet<IOpenApiSchema>();

		if (document.Components?.Schemas is not null) {
			foreach (var schema in document.Components.Schemas.Values) {
				_NormalizeSchema(schema, visitedSchemas);
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

			pathItem.Description = _NormalizeNewlines(pathItem.Description);
			_SortParameters(pathItem.Parameters, path.Key);
			_NormalizeParameters(pathItem.Parameters, visitedSchemas);

			if (pathItem.Operations is null) {
				continue;
			}

			foreach (var operation in pathItem.Operations.Values) {
				if (operation is null) {
					continue;
				}

				operation.Description = _NormalizeNewlines(operation.Description);
				_SortParameters(operation.Parameters, path.Key);
				_NormalizeParameters(operation.Parameters, visitedSchemas);
			}
		}
	}

	/// <summary>
	/// Folds <c>oneOf: [{type: null}, {$ref: T}]</c> into
	/// <c>type: [T, "null"]</c> plus an allOf $ref for every component schema.
	/// .NET 10's OpenAPI generator emits that oneOf shape for C# reference-typed
	/// nullable properties (response projections AND FluentValidation request
	/// bodies alike). Kiota materializes such a union as <c>T | empty-marker</c>
	/// whose marker deserializer always wins, silently swallowing the real
	/// payload into <c>additionalData</c> — the generated fallback branch is
	/// dead code (#639 e2e finding). Reference targets are unresolved proxies
	/// at document-transform time, so the fold applies uniformly; request
	/// builders consume the folded shape through the same untyped factories.
	/// </summary>
	private static void _FoldNullableReferenceUnions(IOpenApiSchema? schema) {
		if (schema is not OpenApiSchema concrete
			|| concrete.OneOf is not { Count: 2 } oneOf) {
			return;
		}

		var hasNullMember = oneOf.Any(
			member => member.Type.HasValue
				&& member.Type.Value.HasFlag(JsonSchemaType.Null)
		);
		if (!hasNullMember) {
			return;
		}

		var refMember = oneOf.OfType<OpenApiSchemaReference>().FirstOrDefault();
		if (refMember is null) {
			return;
		}

		concrete.Type = refMember.Type | JsonSchemaType.Null;
		(concrete.AllOf ??= []).Add(refMember);
		concrete.OneOf = null;
	}

	private static void _SortParameters(IList<IOpenApiParameter>? parameters, string path) {
		if (parameters is null
			|| parameters.Count < 2) {
			return;
		}

		var orderedParameters = parameters
			.Select((parameter, index) => new {
				Parameter = parameter,
				OriginalIndex = index,
			})
			.OrderBy(item => _GetParameterLocationOrder(item.Parameter.In))
			.ThenBy(item => _GetPathParameterIndex(path, item.Parameter))
			.ThenBy(item => item.Parameter.Name ?? string.Empty, StringComparer.Ordinal)
			.ThenBy(item => item.OriginalIndex)
			.Select(item => item.Parameter)
			.ToList();

		parameters.Clear();

		foreach (var parameter in orderedParameters) {
			parameters.Add(parameter);
		}
	}

	private static int _GetParameterLocationOrder(ParameterLocation? location) {
		return location switch {
			ParameterLocation.Path => 0,
			ParameterLocation.Query => 1,
			ParameterLocation.Header => 2,
			ParameterLocation.Cookie => 3,
			_ => 4,
		};
	}

	private static int _GetPathParameterIndex(string path, IOpenApiParameter parameter) {
		if (parameter.In != ParameterLocation.Path
			|| string.IsNullOrEmpty(parameter.Name)) {
			return int.MaxValue;
		}

		var token = "{" + parameter.Name + "}";
		var tokenIndex = path.IndexOf(token, StringComparison.Ordinal);

		return tokenIndex >= 0 ? tokenIndex : int.MaxValue;
	}

	private static void _NormalizeParameters(
		IEnumerable<IOpenApiParameter>? parameters,
		HashSet<IOpenApiSchema> visitedSchemas
	) {
		if (parameters is null) {
			return;
		}

		foreach (var parameter in parameters) {
			parameter.Description = _NormalizeNewlines(parameter.Description);
			_NormalizeSchema(parameter.Schema, visitedSchemas);
		}
	}

	private static void _NormalizeSchema(
		IOpenApiSchema? schema,
		HashSet<IOpenApiSchema> visitedSchemas
	) {
		if (schema is null
			|| !visitedSchemas.Add(schema)) {
			return;
		}

		_FoldNullableReferenceUnions(schema);

		schema.Description = _NormalizeNewlines(schema.Description);

		_NormalizeSchema(schema.Not, visitedSchemas);
		_NormalizeSchema(schema.Items, visitedSchemas);
		_NormalizeSchema(schema.AdditionalProperties, visitedSchemas);

		if (schema.AllOf is not null) {
			foreach (var childSchema in schema.AllOf) {
				_NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.OneOf is not null) {
			foreach (var childSchema in schema.OneOf) {
				_NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.AnyOf is not null) {
			foreach (var childSchema in schema.AnyOf) {
				_NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.Properties is not null) {
			foreach (var childSchema in schema.Properties.Values) {
				_NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.PatternProperties is not null) {
			foreach (var childSchema in schema.PatternProperties.Values) {
				_NormalizeSchema(childSchema, visitedSchemas);
			}
		}

		if (schema.Definitions is not null) {
			foreach (var childSchema in schema.Definitions.Values) {
				_NormalizeSchema(childSchema, visitedSchemas);
			}
		}
	}

	private static string? _NormalizeNewlines(string? value) {
		if (value is null) {
			return null;
		}

		return value
			.Replace("\r\n", "\n", StringComparison.Ordinal)
			.Replace("\r", "\n", StringComparison.Ordinal);
	}
}
