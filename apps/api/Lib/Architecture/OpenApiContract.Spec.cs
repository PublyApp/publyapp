
using System.Text.Json;
using System.Text.RegularExpressions;

using FluentAssertions;

using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

public sealed class OpenApiContractSpec {
	private static readonly Regex QueryParameterNamePattern =
		new(
			"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$",
			RegexOptions.Compiled,
			TimeSpan.FromMilliseconds(100)
		);

	[Fact]
	public async Task ItShouldPublishParametersInCanonicalOrder() {
		using var openApiDocument =
			await ReadOpenApiDocumentAsync();
		var offenders = new List<string>();
		var paths =
			openApiDocument.RootElement
				.GetProperty("paths");

		foreach (var path in paths.EnumerateObject()) {
			foreach (var operation in path.Value.EnumerateObject()) {
				if (!operation.Value.TryGetProperty(
					"parameters",
					out var parameters
				)) {
					continue;
				}

				var actualParameters = parameters
					.EnumerateArray()
					.Select((parameter, index) => new ParameterContractItem(
						parameter.GetProperty("name").GetString() ?? string.Empty,
						parameter.GetProperty("in").GetString() ?? string.Empty,
						index
					))
					.ToList();

				var expectedParameters = actualParameters
					.OrderBy(item => GetParameterLocationOrder(item.Location))
					.ThenBy(item => GetPathParameterIndex(path.Name, item))
					.ThenBy(item => item.Name, StringComparer.Ordinal)
					.ThenBy(item => item.OriginalIndex)
					.Select(FormatParameter)
					.ToList();

				var actualParameterNames = actualParameters
					.Select(FormatParameter)
					.ToList();
				if (actualParameterNames.SequenceEqual(expectedParameters)) {
					continue;
				}

				offenders.Add(
					$"{operation.Name.ToUpperInvariant()} {path.Name}: "
					+ string.Join(", ", actualParameterNames)
				);
			}
		}

		offenders.Should().BeEmpty(
			"OpenAPI parameters must be emitted in canonical location/name order"
		);
	}

	[Fact]
	public async Task ItShouldNotPublishEscapedCarriageReturnsInDescriptions() {
		var openApiDocumentText =
			await OpenApiDocumentHelper.ReadTextAsync();

		openApiDocumentText.Should().NotContain(
			"\\r\\n",
			"OpenAPI description text must use stable LF newlines across environments"
		);
	}

	[Fact]
	public async Task ItShouldPublishSnakeCaseQueryParameterNames() {
		// This guards the public wire contract. Internal C#
		// properties may remain PascalCase, but URL/query names
		// exposed through OpenAPI must stay snake_case so Kiota
		// generates the expected URI templates.
		using var openApiDocument =
			await ReadOpenApiDocumentAsync();
		var offenders = new List<string>();
		var paths =
			openApiDocument.RootElement
				.GetProperty("paths");

		foreach (var path in paths.EnumerateObject()) {
			foreach (var operation in path.Value.EnumerateObject()) {
				if (!operation.Value.TryGetProperty(
					"parameters",
					out var parameters
				)) {
					continue;
				}

				foreach (var parameter in parameters.EnumerateArray()) {
					if (parameter.GetProperty("in").GetString()
						!= "query") {
						continue;
					}

					var name = parameter.GetProperty("name")
						.GetString();
					if (name is null
						|| QueryParameterNamePattern.IsMatch(name)) {
						continue;
					}

					offenders.Add(
						$"{operation.Name.ToUpperInvariant()} "
						+ $"{path.Name}: {name}"
					);
				}
			}
		}

		offenders.Should().BeEmpty(
			"URL/query parameter names must use snake_case"
		);
	}

	[Fact]
	public async Task ItShouldDocumentAuditLogExportResponses() {
		// The export handler writes directly to the response
		// stream, so its success and problem response metadata
		// must be asserted at the OpenAPI layer.
		using var openApiDocument =
			await ReadOpenApiDocumentAsync();
		var responses =
			openApiDocument.RootElement
				.GetProperty("paths")
				.GetProperty("/staff/audit-logs/export")
				.GetProperty("get")
				.GetProperty("responses");

		responses.TryGetProperty("200", out var success)
			.Should().BeTrue();
		success
			.GetProperty("content")
			.TryGetProperty("text/csv", out _)
			.Should().BeTrue();
		success
			.GetProperty("content")
			.TryGetProperty("application/json", out _)
			.Should().BeTrue();

		responses.TryGetProperty("400", out var badRequest)
			.Should().BeTrue();
		badRequest
			.GetProperty("content")
			.TryGetProperty("application/problem+json", out _)
			.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldNotPublishNullableOneOfReferenceUnionProperties() {
		// Kiota materializes oneOf [{type: null}, {$ref: T}] as T | an EMPTY
		// marker interface whose deserializer always wins, swallowing the real
		// payload into additionalData — the generated fallback branch is dead
		// code (#639 e2e finding). The document normalizer folds these unions
		// uniformly into type:[T,"null"] + allOf; request builders consume the
		// folded shape through untyped factories, so nothing regresses.
		using var openApiDocument =
			await ReadOpenApiDocumentAsync();
		var offenders = new List<string>();
		var schemas = openApiDocument.RootElement
			.GetProperty("components")
			.GetProperty("schemas");

		foreach (var schema in schemas.EnumerateObject()) {
			if (!schema.Value.TryGetProperty(
				"properties",
				out var properties
			)) {
				continue;
			}

			foreach (var property in properties.EnumerateObject()) {
				if (!property.Value.TryGetProperty(
					"oneOf",
					out var oneOf
				)) {
					continue;
				}

				var members = oneOf.EnumerateArray().ToList();
				if (members.Count != 2) {
					continue;
				}

				var hasNullMember = members.Any(member =>
					member.ValueKind == JsonValueKind.Object
					&& member.TryGetProperty("type", out var type)
					&& type.GetString() == "null"
				);
				var hasRefMember = members.Any(member =>
					member.ValueKind == JsonValueKind.Object
					&& member.TryGetProperty("$ref", out var reference)
					&& reference.GetString() is { }
				);

				if (hasNullMember && hasRefMember) {
					offenders.Add($"{schema.Name}.{property.Name}");
				}
			}
		}

		offenders.Should().BeEmpty(
			"nullable reference unions must be folded to type:[T,\"null\"] "
			+ "+ allOf, or Kiota clients silently lose the payload"
		);
	}

	private static async Task<JsonDocument> ReadOpenApiDocumentAsync() {
		return await OpenApiDocumentHelper.ReadAsync();
	}

	private static int GetParameterLocationOrder(string location) {
		return location switch {
			"path" => 0,
			"query" => 1,
			"header" => 2,
			"cookie" => 3,
			_ => 4,
		};
	}

	private static int GetPathParameterIndex(string path, ParameterContractItem parameter) {
		if (parameter.Location != "path"
			|| string.IsNullOrEmpty(parameter.Name)) {
			return int.MaxValue;
		}

		var token = "{" + parameter.Name + "}";
		var tokenIndex = path.IndexOf(token, StringComparison.Ordinal);

		return tokenIndex >= 0 ? tokenIndex : int.MaxValue;
	}

	private static string FormatParameter(ParameterContractItem parameter) {
		return $"{parameter.Location}:{parameter.Name}";
	}

	private sealed record ParameterContractItem(
		string Name,
		string Location,
		int OriginalIndex
	);
}
