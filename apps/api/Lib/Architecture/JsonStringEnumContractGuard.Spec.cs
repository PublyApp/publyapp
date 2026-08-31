using System.Reflection;
using System.Text.Json;

using FluentAssertions;

using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Guards the string-enum serializer contract (#1561). The API's wire
/// contract is string-based: every domain enum that crosses the API boundary
/// is serialized via the generic, per-enum JsonStringEnumConverter attribute
/// so Kiota generates typed enums. This spec pins two invariants:
/// 1. No GLOBAL non-generic JsonStringEnumConverter is registered anywhere in
///    the API's service/serializer configuration — a global converter would
///    silently override every per-enum attribute and break the contract for
///    enums whose wire values do not match their C# member names.
/// 2. Every enum carrying the per-enum JsonStringEnumConverter attribute
///    publishes a string-enum OpenAPI schema whose values are exactly the C#
///    member names — the converter's whole point. An enum whose wire values
///    differ from its member names must NOT carry the attribute (it needs a
///    custom converter or a dedicated contract enum instead).
/// The spec reflects over the live API assembly, so adding a new
/// JsonStringEnumConverter-decorated enum without updating the OpenAPI
/// document turns it red.
/// </summary>
public sealed class JsonStringEnumContractGuardSpec {
	static JsonStringEnumContractGuardSpec() {
		AppEnvironment.Initialize();
	}

	/// <summary>
	/// Reflects over every API type and collects the enum types that carry the
	/// per-enum JsonStringEnumConverter attribute. The attribute is applied via
	/// <c>[JsonConverter(typeof(JsonStringEnumConverter&lt;T&gt;))]</c>, so we
	/// look at JsonConverterAttribute constructor arguments and match on the
	/// open type name "JsonStringEnumConverter" — the attribute is defined in
	/// an external package and may not be a compile-time dependency of the test
	/// project.
	/// </summary>
	private static IReadOnlyList<Type> EnumerateStringEnumContractTypes() {
		var results = new List<Type>();
		foreach (var type in ArchitectureDiscovery.EnumerateApiTypes()) {
			if (!type.IsEnum) {
				continue;
			}
			var hasStringEnumConverter = type.GetCustomAttributesData()
				.Where(attributeData => string.Equals(
					attributeData.AttributeType.Name,
					"JsonConverterAttribute",
					StringComparison.Ordinal
				))
				.SelectMany(attributeData => attributeData.ConstructorArguments)
				.Where(argument => argument.Value is Type argType
					&& argType.Name.StartsWith(
						"JsonStringEnumConverter",
						StringComparison.Ordinal)
					&& argType.IsConstructedGenericType)
				.Any();
			if (hasStringEnumConverter) {
				results.Add(type);
			}
		}
		return results;
	}

	[Fact]
	public void ItShouldDiscoverStringEnumContractEnumsToGuard() {
		// Vacuity check: an empty discovery would make the contract guard
		// pass for the wrong reason.
		var contractEnums = EnumerateStringEnumContractTypes();
		_ = contractEnums.Should().NotBeEmpty(
			"the string-enum contract guard must find at least one "
			+ "JsonStringEnumConverter-decorated enum; an empty result "
			+ "would make the guard vacuous."
		);
	}

	[Fact]
	public void ItShouldNotRegisterAGlobalJsonStringEnumConverter() {
		// A global JsonStringEnumConverter (the non-generic type) registered
		// via AddJsonOptions/AddHttpJsonOptions/JsonSerializerOptions would
		// override every per-enum attribute and break the contract for enums
		// whose wire values differ from their C# member names. The API must
		// only use per-enum JsonStringEnumConverter attributes.
		//
		// The signature-based scan below catches any attempt to reference the
		// non-generic type in method signatures, fields, or properties — the
		// surface a global registration must touch.
		var offenders = new List<string>();

		foreach (var type in ArchitectureDiscovery.EnumerateApiTypes()) {
			// Check method return types and parameter types.
			foreach (var method in type.GetMethods(
				BindingFlags.Public | BindingFlags.NonPublic
				| BindingFlags.Static | BindingFlags.Instance
				| BindingFlags.DeclaredOnly)) {
				if (IsNonGenericJsonStringEnumConverter(method.ReturnType)) {
					offenders.Add($"{method.DeclaringType?.FullName}.{method.Name}: "
						+ "returns non-generic JsonStringEnumConverter");
				}
				foreach (var parameter in method.GetParameters()) {
					if (IsNonGenericJsonStringEnumConverter(parameter.ParameterType)) {
						offenders.Add($"{method.DeclaringType?.FullName}.{method.Name}: "
							+ $"parameter {parameter.Name} is non-generic JsonStringEnumConverter");
					}
				}
			}

			// Check fields and properties.
			foreach (var field in type.GetFields(
				BindingFlags.Public | BindingFlags.NonPublic
				| BindingFlags.Static | BindingFlags.Instance
				| BindingFlags.DeclaredOnly)) {
				if (IsNonGenericJsonStringEnumConverter(field.FieldType)) {
					offenders.Add($"{type.FullName}.{field.Name}: "
						+ "field is non-generic JsonStringEnumConverter");
				}
			}
			foreach (var property in type.GetProperties(
				BindingFlags.Public | BindingFlags.NonPublic
				| BindingFlags.Static | BindingFlags.Instance
				| BindingFlags.DeclaredOnly)) {
				if (IsNonGenericJsonStringEnumConverter(property.PropertyType)) {
					offenders.Add($"{type.FullName}.{property.Name}: "
						+ "property is non-generic JsonStringEnumConverter");
				}
			}
		}

		_ = offenders.Should().BeEmpty(
			"a global (non-generic) JsonStringEnumConverter must never be "
			+ "registered — it would override per-enum attributes and break "
			+ "the string-enum wire contract. Use per-enum "
			+ "JsonStringEnumConverter attributes only."
		);
	}

	[Fact]
	public async Task ItShouldPublishStringEnumContractEnumsWithMemberNameValues() {
		// Every enum carrying the per-enum JsonStringEnumConverter attribute
		// must publish a string-enum OpenAPI schema whose values are exactly
		// the C# member names. This is the converter's contract: the wire
		// value IS the member name. An enum whose wire values differ from its
		// member names must NOT carry the attribute.
		var openApiDocument = await OpenApiDocumentHelper.ReadAsync();
		var schemas = openApiDocument.RootElement
			.GetProperty("components")
			.GetProperty("schemas");

		var contractEnums = EnumerateStringEnumContractTypes();
		var offenders = new List<string>();

		foreach (var enumType in contractEnums) {
			var expectedValues = Enum.GetNames(enumType);
			var expectedOrdered = expectedValues
				.OrderBy(v => v, StringComparer.Ordinal)
				.ToList();

			// Find the schema for this enum.
			var enumName = enumType.Name;
			if (!schemas.TryGetProperty(enumName, out var schema)) {
				offenders.Add($"{enumName}: schema missing from OpenAPI document");
				continue;
			}

			if (!schema.TryGetProperty("enum", out var enumValues)) {
				offenders.Add($"{enumName}: expected an enum schema");
				continue;
			}

			var actualValues = enumValues.EnumerateArray()
				.Select(v => v.GetString())
				.Where(v => v is not null)
				.Select(v => v!)
				.OrderBy(v => v, StringComparer.Ordinal)
				.ToList();

			if (!actualValues.SequenceEqual(expectedOrdered)) {
				offenders.Add(
					$"{enumName}: enum values [{string.Join(", ", actualValues)}] "
					+ $"do not match the C# member names [{string.Join(", ", expectedOrdered)}]"
				);
			}

			// Verify the schema is string-typed: either an explicit
			// type:string, a type array containing "string", or — the
			// enum-only shape the document normalizer emits — an enum
			// array of all string values with no type at all (which is
			// implicitly a string enum in OpenAPI 3.x).
			var typeIsString = false;
			if (schema.TryGetProperty("type", out var typeNode)) {
				typeIsString = typeNode.ValueKind == JsonValueKind.String
					? typeNode.GetString() == "string"
					: typeNode.EnumerateArray()
						.Any(t => t.ValueKind == JsonValueKind.String
							&& t.GetString() == "string");
			} else {
				// No explicit type: verify all enum values are strings.
				typeIsString = actualValues.Count > 0
					&& actualValues.Count == enumValues.EnumerateArray().Count();
			}

			if (!typeIsString) {
				offenders.Add($"{enumName}: enum schema is not string-typed");
			}
		}

		offenders.Should().BeEmpty(
			"every JsonStringEnumConverter-decorated enum must publish a "
			+ "string-enum OpenAPI schema whose values are exactly the C# member names"
		);
	}

	private static bool IsNonGenericJsonStringEnumConverter(Type type) {
		// The non-generic JsonStringEnumConverter is the global-registration
		// type. Its open name is "JsonStringEnumConverter" (no backtick).
		return string.Equals(
			type.Name,
			"JsonStringEnumConverter",
			StringComparison.Ordinal)
			&& type is { IsGenericType: false, IsConstructedGenericType: false };
	}
}
