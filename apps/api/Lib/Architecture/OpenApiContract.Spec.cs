
using System.Text.Json;
using System.Text.RegularExpressions;

using FluentAssertions;

using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

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

	// Schema name → property → the exact enum value set the wire contract
	// promises. Derived from the domain enums' member names (single source of
	// truth); nameof keeps the pin rename-safe.
	private static readonly Dictionary<string, Dictionary<string, string[]>> ExpectedEnumProperties =
		new() {
			// UserStatus (Modules/Users/Entities/User.cs)
			["GetStaffUserByIdResult"] = new() {
				["status"] = [
					nameof(UserStatus.Active),
					nameof(UserStatus.Suspended),
				],
			},
			["StaffProfileUserItem"] = new() {
				["status"] = [
					nameof(UserStatus.Active),
					nameof(UserStatus.Suspended),
				],
			},
			["StaffUserItem"] = new() {
				["status"] = [
					nameof(UserStatus.Active),
					nameof(UserStatus.Suspended),
				],
				["level"] = [nameof(AccountLevel.Admin), nameof(AccountLevel.User)],
			},
			["StaffUserReactivatedResult"] = new() {
				["status"] = [
					nameof(UserStatus.Active),
					nameof(UserStatus.Suspended),
				],
			},
			["StaffUserSuspendedResult"] = new() {
				["status"] = [
					nameof(UserStatus.Active),
					nameof(UserStatus.Suspended),
				],
			},
			["TenantUserDetailsForStaffResult"] = new() {
				["status"] = [
					nameof(UserStatus.Active),
					nameof(UserStatus.Suspended),
				],
			},
			// TenantStatus (Modules/Tenants/Entities/Tenant.cs)
			["GetTenantAsStaffResult"] = new() {
				["status"] = [
					nameof(TenantStatus.Pending),
					nameof(TenantStatus.Active),
					nameof(TenantStatus.Suspended),
				],
			},
			["TenantAsStaffListItem"] = new() {
				["status"] = [
					nameof(TenantStatus.Pending),
					nameof(TenantStatus.Active),
					nameof(TenantStatus.Suspended),
				],
			},
			["TenantForPickerItem"] = new() {
				["status"] = [
					nameof(TenantStatus.Pending),
					nameof(TenantStatus.Active),
					nameof(TenantStatus.Suspended),
				],
			},
			// TenantUserStatus — derived effective membership status
			// (Modules/Users/Entities/UserAccount.cs GetTenantStatus).
			["ReactivateTenantUserResult"] = new() {
				["status"] = [
					nameof(TenantUserStatus.Active),
					nameof(TenantUserStatus.Suspended),
					nameof(TenantUserStatus.GloballySuspended),
				],
				["level"] = [nameof(AccountLevel.Admin), nameof(AccountLevel.User)],
			},
			["SuspendTenantUserResult"] = new() {
				["status"] = [
					nameof(TenantUserStatus.Active),
					nameof(TenantUserStatus.Suspended),
					nameof(TenantUserStatus.GloballySuspended),
				],
				["level"] = [nameof(AccountLevel.Admin), nameof(AccountLevel.User)],
			},
			["TenantUserDetailsResult"] = new() {
				["status"] = [
					nameof(TenantUserStatus.Active),
					nameof(TenantUserStatus.Suspended),
					nameof(TenantUserStatus.GloballySuspended),
				],
				["level"] = [nameof(AccountLevel.Admin), nameof(AccountLevel.User)],
			},
			["TenantUserItem"] = new() {
				["status"] = [
					nameof(TenantUserStatus.Active),
					nameof(TenantUserStatus.Suspended),
					nameof(TenantUserStatus.GloballySuspended),
				],
				["level"] = [nameof(AccountLevel.Admin), nameof(AccountLevel.User)],
			},
			["TenantUserCompanyForStaffResult"] = new() {
				["status"] = [
					nameof(TenantUserStatus.Active),
					nameof(TenantUserStatus.Suspended),
					nameof(TenantUserStatus.GloballySuspended),
				],
				["level"] = [nameof(AccountLevel.Admin), nameof(AccountLevel.User)],
			},
			["TenantProfileUserItem"] = new() {
				["status"] = [
					nameof(TenantUserStatus.Active),
					nameof(TenantUserStatus.Suspended),
					nameof(TenantUserStatus.GloballySuspended),
				],
				["level"] = [nameof(AccountLevel.Admin), nameof(AccountLevel.User)],
			},
			// AccountLevel — auth bootstrap + invitation items.
			["GetScopeAuthDataTenant"] = new() {
				["accountLevel"] = [
					nameof(AccountLevel.Admin),
					nameof(AccountLevel.User),
				],
			},
			["StaffTenantInvitationListItem"] = new() {
				["accountLevel"] = [
					nameof(AccountLevel.Admin),
					nameof(AccountLevel.User),
				],
			},
			// InvitationEffectiveStatus — derived pending/accepted/expired/revoked.
			["InvitationListItem"] = new() {
				["status"] = [
					nameof(InvitationEffectiveStatus.Pending),
					nameof(InvitationEffectiveStatus.Accepted),
					nameof(InvitationEffectiveStatus.Expired),
					nameof(InvitationEffectiveStatus.Revoked),
				],
			},
			["StaffInvitationDetails"] = new() {
				["status"] = [
					nameof(InvitationEffectiveStatus.Pending),
					nameof(InvitationEffectiveStatus.Accepted),
					nameof(InvitationEffectiveStatus.Expired),
					nameof(InvitationEffectiveStatus.Revoked),
				],
			},
		};

	[Fact]
	public async Task ItShouldPublishDomainStatusFieldsAsStringEnumSchemas() {
		using var openApiDocument = await ReadOpenApiDocumentAsync();
		var schemas = openApiDocument.RootElement.GetProperty("components")
			.GetProperty("schemas");

		var offenders = new List<string>();
		foreach (var (schemaName, properties) in ExpectedEnumProperties) {
			if (!schemas.TryGetProperty(schemaName, out var schema)) {
				offenders.Add($"{schemaName}: schema missing from OpenAPI document");
				continue;
			}

			foreach (var (propertyName, expectedValues) in properties) {
				if (!schema.TryGetProperty("properties", out var schemaProperties)
					|| !schemaProperties.TryGetProperty(
						propertyName,
						out var propertyNode
					)) {
					offenders.Add(
						$"{schemaName}.{propertyName}: property missing"
					);
					continue;
				}

				var failure = AssertStringEnumSchema(
					schemas,
					schemaName,
					propertyName,
					propertyNode,
					expectedValues
				);
				if (failure is not null) {
					offenders.Add(failure);
				}
			}
		}

		offenders.Should().BeEmpty(
			"every domain-backed status/level response field must publish a "
			+ "real string enum schema so Kiota generates typed enums (#349)"
		);
	}

	[Fact]
	public async Task ItShouldNotPublishNumericStatusEnums() {
		using var openApiDocument = await ReadOpenApiDocumentAsync();
		var schemas = openApiDocument.RootElement.GetProperty("components")
			.GetProperty("schemas");

		var offenders = new List<string>();
		foreach (var (schemaName, properties) in ExpectedEnumProperties) {
			if (!schemas.TryGetProperty(schemaName, out var schema)
				|| !schema.TryGetProperty("properties", out var schemaProperties)) {
				continue;
			}

			foreach (var propertyName in properties.Keys) {
				if (!schemaProperties.TryGetProperty(propertyName, out var propertyNode)) {
					continue;
				}

				var resolved = ResolveSchemaNode(schemas, propertyNode, []);
				if (!resolved.HasValue) {
					continue;
				}

				var node = resolved.Value;
				if (!node.TryGetProperty("enum", out var enumValues)) {
					continue;
				}

				foreach (var value in enumValues.EnumerateArray()) {
					if (value.ValueKind == JsonValueKind.Number) {
						offenders.Add(
							$"{schemaName}.{propertyName}: numeric enum value "
							+ $"{value.GetRawText()} leaked into the contract"
						);
					}
				}
			}
		}

		offenders.Should().BeEmpty(
			"the JSON wire contract is string-based; numeric enum schemas would "
			+ "push clients toward integer values (#349 acceptance criteria)"
		);
	}

	/// <summary>
	/// Follows <c>$ref</c>/<c>allOf</c> folding (the nullability normalizer wraps
	/// optional reference properties in allOf) until an inline schema node is
	/// reached, then verifies it is a string enum whose values match exactly.
	/// </summary>
	private static string? AssertStringEnumSchema(
		JsonElement schemas,
		string schemaName,
		string propertyName,
		JsonElement propertyNode,
		string[] expectedValues
	) {
		var resolved = ResolveSchemaNode(schemas, propertyNode, []);
		if (!resolved.HasValue) {
			return $"{schemaName}.{propertyName}: could not resolve an inline schema";
		}

		var node = resolved.Value;

		// A folded nullable enum can carry type:["string","null"]; accept any
		// shape but require "string" to be present and never integer-only.
		var typeIsString = false;
		if (node.TryGetProperty("type", out var typeNode)) {
			typeIsString = typeNode.ValueKind == JsonValueKind.String
				? typeNode.GetString() == "string"
				: typeNode.EnumerateArray()
					.Any(t => t.ValueKind == JsonValueKind.String
						&& t.GetString() == "string");
		}

		if (!node.TryGetProperty("enum", out var enumNode)) {
			return $"{schemaName}.{propertyName}: expected a string enum schema "
				+ $"but found {(typeIsString ? "a plain string" : node.GetRawText())} "
				+ "(bare type:string forces clients to hand-maintain enum copies)";
		}

		if (!typeIsString) {
			return $"{schemaName}.{propertyName}: enum schema must be string-typed";
		}

		var actualValues = enumNode.EnumerateArray()
			.Select(v => v.ValueKind == JsonValueKind.String ? v.GetString() : v.GetRawText())
			.Where(v => v is not null)
			.Select(v => v!)
			.OrderBy(v => v, StringComparer.Ordinal)
			.ToList();
		var expectedOrdered = expectedValues
			.OrderBy(v => v, StringComparer.Ordinal)
			.ToList();

		if (!actualValues.SequenceEqual(expectedOrdered)) {
			return $"{schemaName}.{propertyName}: enum values [{string.Join(", ", actualValues)}] "
				+ $"do not match the domain contract [{string.Join(", ", expectedOrdered)}]";
		}

		return null;
	}

	private static JsonElement? ResolveSchemaNode(
		JsonElement schemas,
		JsonElement node,
		HashSet<string> visitedRefs
	) {
		if (node.ValueKind != JsonValueKind.Object) {
			return null;
		}

		if (node.TryGetProperty("$ref", out var refNode)
			&& refNode.ValueKind == JsonValueKind.String) {
			var refText = refNode.GetString();
			if (refText is null || !visitedRefs.Add(refText)) {
				return null;
			}

			const string refPrefix = "#/components/schemas/";
			if (!refText.StartsWith(refPrefix, StringComparison.Ordinal)) {
				return null;
			}

			var targetName = refText[refPrefix.Length..];
			if (!schemas.TryGetProperty(targetName, out var target)) {
				return null;
			}

			return ResolveSchemaNode(schemas, target, visitedRefs);
		}

		if (node.TryGetProperty("allOf", out var allOfNode)
			&& allOfNode.ValueKind == JsonValueKind.Array) {
			foreach (var member in allOfNode.EnumerateArray()) {
				var resolvedMember = ResolveSchemaNode(schemas, member, visitedRefs);
				if (resolvedMember.HasValue) {
					return resolvedMember;
				}
			}

			return null;
		}

		return node;
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
