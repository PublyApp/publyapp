using System.Reflection;
using System.Runtime.CompilerServices;

using FluentValidation;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Centralizes discovery and exclusion logic so new architecture specs call this
/// helper instead of reimplementing assembly enumeration.
/// Every new architecture spec must call this helper for type enumeration.
/// </summary>
public static class ArchitectureDiscovery {
	private const string HandlerNamespaceFragment = ".Handlers.";
	private const string ServiceNamespaceFragment = ".Services";
	private const string RoutesRootFullName = "PublyApp.Api.Lib.Routes.Routes";

	private static readonly string[] WireDtoSuffixes = [
		"Body",
		"Query",
		"Result",
		"Response",
		"Item",
	];

	/// <summary>
	/// Returns non-generated types from the API runtime assembly.
	/// </summary>
	/// <remarks>
	/// Excludes Microsoft.*, System.*, PublyApp.Api.Migrations.*, generated
	/// OpenAPI/build output, compiler-generated types, and anonymous types.
	/// </remarks>
	public static IReadOnlyList<Type> EnumerateApiTypes() {
		return LoadApiAssembly()
			.GetTypes()
			.Where(IsDiscoverableApiType)
			.OrderBy(type => type.FullName, StringComparer.Ordinal)
			.ToList();
	}

	/// <summary>
	/// Returns handler <c>Handle</c> entrypoint methods from non-generated API handler classes.
	/// </summary>
	/// <remarks>
	/// Excludes non-handler namespaces, validators, DTO-only types, Microsoft.*,
	/// System.*, PublyApp.Api.Migrations.*, generated OpenAPI/build output,
	/// compiler-generated types, and anonymous types.
	/// </remarks>
	public static IReadOnlyList<MethodInfo> EnumerateHandlerEntrypoints() {
		return EnumerateHandlerTypes()
			.Where(type =>
				type is { IsClass: true, IsAbstract: false })
			.Select(type => type.GetMethod(
				"Handle",
				BindingFlags.Public
				| BindingFlags.Static
			))
			.Where(method => method is not null)
			.Cast<MethodInfo>()
			.OrderBy(method =>
				$"{method.DeclaringType?.FullName}.{method.Name}",
				StringComparer.Ordinal
			)
			.ToList();
	}

	/// <summary>
	/// Returns non-generated domain service types under <c>PublyApp.Api.Modules.*.Services</c>.
	/// </summary>
	/// <remarks>
	/// Excludes non-service namespaces, Microsoft.*, System.*, PublyApp.Api.Migrations.*,
	/// generated OpenAPI/build output, compiler-generated types, and anonymous types.
	/// </remarks>
	public static IReadOnlyList<Type> EnumerateDomainServices() {
		return EnumerateApiTypes()
			.Where(type =>
				type.Namespace?.EndsWith(
					ServiceNamespaceFragment,
					StringComparison.Ordinal
				) is true)
			.ToList();
	}

	/// <summary>
	/// Returns public route constants from the central Routes partial class.
	/// </summary>
	/// <remarks>
	/// Excludes Microsoft.*, System.*, PublyApp.Api.Migrations.*, generated
	/// OpenAPI/build output, compiler-generated types, and anonymous types.
	/// </remarks>
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

	/// <summary>
	/// Returns HTTP wire DTO records declared beside handlers.
	/// </summary>
	/// <remarks>
	/// Excludes non-handler namespaces, validators, Microsoft.*, System.*,
	/// PublyApp.Api.Migrations.*, generated OpenAPI/build output, compiler-generated
	/// types, and anonymous types.
	/// </remarks>
	public static IReadOnlyList<Type> EnumerateWireDtoTypes() {
		return EnumerateHandlerTypes()
			.Where(type =>
				WireDtoSuffixes.Any(suffix =>
					type.Name.EndsWith(suffix, StringComparison.Ordinal)))
			.ToList();
	}

	/// <summary>
	/// Returns handler entrypoint classes by mapping discovered <c>Handle</c>
	/// methods back to their declaring types.
	/// </summary>
	/// <remarks>
	/// Excludes non-handler namespaces, validators, DTO-only types, Microsoft.*,
	/// System.*, PublyApp.Api.Migrations.*, generated OpenAPI/build output,
	/// compiler-generated types, and anonymous types.
	/// </remarks>
	public static IReadOnlyList<Type> EnumerateHandlerEntrypointTypes() {
		return EnumerateHandlerEntrypoints()
			.Select(method => method.DeclaringType)
			.Where(type => type is not null)
			.Cast<Type>()
			.ToList();
	}

	/// <summary>
	/// Returns handler classes exposing any public static <c>Handle*</c> method.
	/// </summary>
	/// <remarks>
	/// Excludes non-handler namespaces, validators, Microsoft.*, System.*,
	/// PublyApp.Api.Migrations.*, generated OpenAPI/build output, compiler-generated
	/// types, and anonymous types, but includes misnamed <c>Handle*</c> candidates.
	/// </remarks>
	public static IReadOnlyList<Type> EnumerateHandlerEntrypointCandidateTypes() {
		return EnumerateHandlerTypes()
			.Where(type =>
				type is { IsClass: true, IsAbstract: false }
				&& type
					.GetMethods(BindingFlags.Public | BindingFlags.Static)
					.Any(method =>
						method.Name.StartsWith("Handle", StringComparison.Ordinal)))
			.ToList();
	}

	/// <summary>
	/// Returns FluentValidation validators declared in handler namespaces.
	/// </summary>
	/// <remarks>
	/// Excludes non-handler namespaces, Microsoft.*, System.*, PublyApp.Api.Migrations.*,
	/// generated OpenAPI/build output, compiler-generated types, and anonymous types.
	/// </remarks>
	public static IReadOnlyList<Type> EnumerateValidatorTypes() {
		return EnumerateApiTypes()
			.Where(type =>
				type.Namespace?.Contains(
					HandlerNamespaceFragment,
					StringComparison.Ordinal
				) is true)
			.Where(type =>
				type is { IsClass: true, IsAbstract: false }
				&& !type.IsGenericTypeDefinition)
			.Where(type => GetValidatorTarget(type) is not null)
			.OrderBy(type => type.FullName, StringComparer.Ordinal)
			.ToList();
	}

	/// <summary>
	/// Returns the request contract type targeted by an
	/// <c>AbstractValidator&lt;T&gt;</c>, or <c>null</c> when the type is not a
	/// FluentValidation validator.
	/// </summary>
	/// <remarks>
	/// Applies no discovery exclusions; callers provide a type that was already discovered.
	/// </remarks>
	public static Type? GetValidatorTarget(Type type) {
		var current = type.BaseType;
		while (current is not null) {
			if (current.IsGenericType
				&& current.GetGenericTypeDefinition()
					== typeof(AbstractValidator<>)) {
				return current.GetGenericArguments()[0];
			}

			current = current.BaseType;
		}

		return null;
	}

	private static Assembly LoadApiAssembly() {
		return typeof(Program).Assembly;
	}

	private static IReadOnlyList<Type> EnumerateHandlerTypes() {
		return EnumerateApiTypes()
			.Where(type =>
				type.Namespace?.Contains(
					HandlerNamespaceFragment,
					StringComparison.Ordinal
				) is true)
			.Where(type =>
				!type.Name.EndsWith("Validator", StringComparison.Ordinal))
			.ToList();
	}

	private static IReadOnlyList<Type> EnumerateRouteConstantTypes() {
		var routesRoot = EnumerateApiTypes()
			.SingleOrDefault(type =>
				type is { IsClass: true, IsAbstract: true, IsSealed: true }
				&& type.FullName == RoutesRootFullName);

		if (routesRoot is null) {
			return [];
		}

		var discovered = new List<Type>();
		CollectNestedTypes(routesRoot, discovered);
		return discovered;
	}

	private static void CollectNestedTypes(Type type, List<Type> sink) {
		sink.Add(type);

		foreach (var nested in type.GetNestedTypes(BindingFlags.Public)) {
			if (IsDiscoverableApiType(nested)) {
				CollectNestedTypes(nested, sink);
			}
		}
	}

	private static bool IsDiscoverableApiType(Type type) {
		if (type.Assembly != LoadApiAssembly()) {
			return false;
		}

		if (type.FullName is null || type.Namespace is null) {
			return false;
		}

		if (type.Namespace.StartsWith("Microsoft.", StringComparison.Ordinal)
			|| type.Namespace.StartsWith("System.", StringComparison.Ordinal)) {
			return false;
		}

		if (type.Namespace == "PublyApp.Api.Migrations"
			|| type.Namespace.Contains(".Migrations", StringComparison.Ordinal)) {
			// EF Core migration types are generated; arch invariants do not apply.
			return false;
		}

		if (type.Namespace.Contains(".Generated", StringComparison.Ordinal)
			|| type.FullName.Contains(".Generated", StringComparison.Ordinal)
			|| type.FullName.Contains("OpenApi", StringComparison.Ordinal)) {
			// Generated OpenAPI/build output is not subject to authored API conventions.
			return false;
		}

		if (type.IsGenericTypeDefinition
			|| type.IsDefined(typeof(CompilerGeneratedAttribute), inherit: false)
			|| type.Name.Contains('<', StringComparison.Ordinal)
			|| IsAnonymousType(type)) {
			// Compiler-generated types (state machines, closures) are not subject to
			// handler/service conventions.
			// Anonymous types compile to internal sealed classes with non-stable names;
			// reflecting over them produces noise.
			return false;
		}

		return true;
	}

	private static bool IsAnonymousType(Type type) {
		return type.IsDefined(typeof(CompilerGeneratedAttribute), inherit: false)
			&& type.Name.Contains("AnonymousType", StringComparison.Ordinal);
	}

	/// <summary>A discovered route constant: its readable name and string value.</summary>
	public sealed record RouteConstant(string Name, string Value);
}
