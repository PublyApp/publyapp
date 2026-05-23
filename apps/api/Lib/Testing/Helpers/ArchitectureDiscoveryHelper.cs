namespace MainApi.Lib.Testing.Helpers;

using System.Reflection;

/// <summary>
/// Shared reflection helper for architecture-guard specs. It loads the API
/// assembly and enumerates the type categories guards care about (handler types,
/// HTTP wire DTO records, service types, route-constant classes) while excluding
/// generated/build artifacts (generated client, OpenAPI, EF migrations, obj/bin).
///
/// Lives under <c>Lib/Testing/Helpers/</c> so it compiles only into the test
/// project — <c>MainApi.csproj</c> removes <c>Lib/Testing/**/*.cs</c> from the
/// production assembly. Keep it small and offender-readable: every enumerator
/// returns <see cref="Type"/>s so callers can report concrete
/// <c>Type.Name</c>/member names rather than a generic failure.
/// </summary>
internal static class ArchitectureDiscoveryHelper {
	/// <summary>Marker namespace fragment shared by every handler type.</summary>
	private const string HandlerNamespaceFragment = ".Handlers.";

	/// <summary>Marker namespace fragment shared by every domain service type.</summary>
	private const string ServiceNamespaceFragment = ".Services";

	/// <summary>
	/// Suffixes that identify an HTTP wire DTO record on a handler
	/// (request body, query, and response shapes). These are the contract
	/// types that must never leak server-only constructs like
	/// <c>PatchField&lt;T&gt;</c>.
	/// </summary>
	private static readonly string[] WireDtoSuffixes = [
		"Body",
		"Query",
		"Result",
		"Response",
		"Item",
	];

	/// <summary>
	/// Namespace fragments that identify generated code (EF migrations, generated
	/// client). Types in these namespaces are never authored by hand and must be
	/// excluded so guards only fault real, hand-written code. (Build output dirs
	/// like obj/bin never surface as CLR namespace fragments, so they need no entry.)
	/// </summary>
	private static readonly string[] ExcludedNamespaceFragments = [
		".Migrations",
		".Generated",
	];

	/// <summary>Loads the API assembly that hosts production handlers/services.</summary>
	public static Assembly LoadApiAssembly() {
		return typeof(Program).Assembly;
	}

	/// <summary>
	/// Enumerates handler types: classes living under
	/// <c>MainApi.Modules.*.Handlers.*</c>, excluding validators, generic type
	/// definitions, and generated/build artifacts.
	/// </summary>
	public static IReadOnlyList<Type> EnumerateHandlerTypes() {
		return LoadApiAssembly()
			.GetTypes()
			.Where(type =>
				type.Namespace?.Contains(
					HandlerNamespaceFragment,
					StringComparison.Ordinal
				) == true)
			.Where(IsHandWrittenType)
			.OrderBy(type => type.FullName, StringComparer.Ordinal)
			.ToList();
	}

	/// <summary>
	/// Enumerates HTTP wire DTO records declared on handlers — types whose name
	/// ends with a known wire suffix (<c>Body</c>/<c>Query</c>/<c>Result</c>/
	/// <c>Response</c>/<c>Item</c>). These are the contract surface guards scan
	/// for leaked server-only types.
	/// </summary>
	public static IReadOnlyList<Type> EnumerateWireDtoTypes() {
		return EnumerateHandlerTypes()
			.Where(type =>
				WireDtoSuffixes.Any(suffix =>
					type.Name.EndsWith(suffix, StringComparison.Ordinal)))
			.ToList();
	}

	/// <summary>
	/// Enumerates service types: classes/interfaces living under
	/// <c>MainApi.Modules.*.Services</c>, excluding generated/build artifacts.
	/// </summary>
	public static IReadOnlyList<Type> EnumerateServiceTypes() {
		return LoadApiAssembly()
			.GetTypes()
			.Where(type =>
				type.Namespace?.EndsWith(
					ServiceNamespaceFragment,
					StringComparison.Ordinal
				) == true)
			.Where(IsHandWrittenType)
			.OrderBy(type => type.FullName, StringComparer.Ordinal)
			.ToList();
	}

	/// <summary>
	/// Enumerates the route-constant carrier classes — the nested static classes
	/// reachable from the central <c>MainApi.Lib.Routes.Routes</c> partial class
	/// (each domain contributes a partial). Returned types expose route path
	/// constants via public <c>const string</c> fields.
	/// </summary>
	public static IReadOnlyList<Type> EnumerateRouteConstantTypes() {
		var routesRoot = LoadApiAssembly()
			.GetTypes()
			.SingleOrDefault(type =>
				type is { IsClass: true, IsAbstract: true, IsSealed: true }
				&& type.FullName == "MainApi.Lib.Routes.Routes");

		if (routesRoot is null) {
			return [];
		}

		var discovered = new List<Type>();
		CollectNestedTypes(routesRoot, discovered);
		return discovered;
	}

	/// <summary>
	/// Enumerates every <c>public const string</c> route segment declared on the
	/// route-constant classes as <c>(DeclaringType.Name + "." + FieldName, value)</c>
	/// pairs, so guards can report the exact offending constant.
	/// </summary>
	public static IReadOnlyList<RouteConstant> EnumerateRouteConstants() {
		var constants = new List<RouteConstant>();

		foreach (var routeType in EnumerateRouteConstantTypes()) {
			var fields = routeType.GetFields(
				BindingFlags.Public
				| BindingFlags.Static
				| BindingFlags.DeclaredOnly
			);

			foreach (var field in fields) {
				if (!field.IsLiteral || field.FieldType != typeof(string)) {
					continue;
				}

				if (field.GetRawConstantValue() is not string value) {
					continue;
				}

				constants.Add(
					new RouteConstant(
						$"{routeType.Name}.{field.Name}",
						value
					)
				);
			}
		}

		return constants;
	}

	private static void CollectNestedTypes(Type type, List<Type> sink) {
		sink.Add(type);

		foreach (var nested in type.GetNestedTypes(BindingFlags.Public)) {
			CollectNestedTypes(nested, sink);
		}
	}

	/// <summary>
	/// True when the type is hand-written application code worth guarding:
	/// not a validator, not a generic type definition, and not part of a
	/// generated/build-artifact namespace.
	/// </summary>
	private static bool IsHandWrittenType(Type type) {
		if (type.Name.EndsWith("Validator", StringComparison.Ordinal)) {
			return false;
		}

		if (type.Name.Contains('<') || type.IsGenericTypeDefinition) {
			return false;
		}

		var fullName = type.FullName;
		if (fullName is null) {
			return false;
		}

		return !ExcludedNamespaceFragments.Any(fragment =>
			fullName.Contains(fragment, StringComparison.Ordinal));
	}

	/// <summary>A discovered route constant: its readable name and string value.</summary>
	public sealed record RouteConstant(string Name, string Value);
}
