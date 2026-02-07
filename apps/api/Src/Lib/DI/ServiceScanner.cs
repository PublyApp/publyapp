using System.Reflection;

namespace MainApi.Src.Lib.DI;

/// <summary>
/// Represents a discovered service decorated with [Service] attribute.
/// </summary>
public sealed record DiscoveredService {
	public required Type ImplementationType { get; init; }
	public required Type? ServiceInterface { get; init; }
	public required ServiceLifetime Lifetime { get; init; }
	public required string? Key { get; init; }
	public required string Namespace { get; init; }
	public required string? InterfaceResolutionError { get; init; }
}

/// <summary>
/// Scans the Main API assembly for [Service] attributed classes and validates them.
/// Phase 2: validation only, no registration changes.
/// </summary>
public static class ServiceScanner {

	/// <summary>
	/// Scans the assembly containing the specified type for [Service] attributed classes.
	/// </summary>
	public static List<DiscoveredService> ScanAssembly<TAssemblyMarker>() {
		return ScanAssembly(typeof(TAssemblyMarker).Assembly);
	}

	/// <summary>
	/// Scans the specified assembly for [Service] attributed classes.
	/// </summary>
	/// <exception cref="InvalidOperationException">
	/// Thrown when assembly types cannot be loaded (wraps ReflectionTypeLoadException with actionable details).
	/// </exception>
	public static List<DiscoveredService> ScanAssembly(Assembly assembly) {
		var discovered = new List<DiscoveredService>();

		Type[] types;
		try {
			types = assembly.GetTypes();
		} catch (ReflectionTypeLoadException ex) {
			// Fail fast with actionable diagnostics
			var loaderExceptions = ex.LoaderExceptions
				.Where(e => e is not null)
				.Select(e => e!.Message)
				.Distinct()
				.Take(10) // Truncate to first 10 distinct messages
				.ToList();

			var sb = new System.Text.StringBuilder();
			sb.AppendLine(
				$"[Service] scanner failed to load types from assembly '{assembly.GetName().Name}'. " +
				$"Loader exceptions ({ex.LoaderExceptions.Length} total, showing up to 10 distinct):"
			);
			foreach (var message in loaderExceptions) {
				sb.AppendLine($"  - {message}");
			}

			throw new InvalidOperationException(sb.ToString(), ex);
		}

		var typesWithAttribute = types
			.Where(t => t.GetCustomAttribute<ServiceAttribute>() is not null)
			.ToList();

		foreach (var type in typesWithAttribute) {
			var attribute = type.GetCustomAttribute<ServiceAttribute>()!;
			var (primaryInterface, interfaceResolutionError) = FindPrimaryInterface(type);

			discovered.Add(new DiscoveredService {
				ImplementationType = type,
				ServiceInterface = primaryInterface,
				Lifetime = attribute.Lifetime,
				Key = attribute.Key,
				Namespace = type.Namespace ?? string.Empty,
				InterfaceResolutionError = interfaceResolutionError
			});
		}

		return discovered;
	}

	/// <summary>
	/// Finds the primary interface I{ClassName} for a given type.
	/// Returns null if not found, and returns an error if missing or ambiguous.
	/// </summary>
	private static (Type? Interface, string? Error) FindPrimaryInterface(Type implementationType) {
		var expectedInterfaceName = $"I{implementationType.Name}";

		var matches = implementationType
			.GetInterfaces()
			.Where(i => i.Name == expectedInterfaceName)
			.ToList();

		if (matches.Count == 0) {
			return (
				null,
				$"missing primary interface '{expectedInterfaceName}'. The class must implement an interface named 'I{{ClassName}}'."
			);
		}

		if (matches.Count > 1) {
			var matchNames = string.Join(", ", matches.Select(i => i.FullName ?? i.Name));
			return (
				null,
				$"ambiguous primary interface '{expectedInterfaceName}'. Multiple matches found: [{matchNames}]."
			);
		}

		return (matches[0], null);
	}
}
