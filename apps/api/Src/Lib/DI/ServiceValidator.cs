using System.Text;
using System.Text.RegularExpressions;

namespace MainApi.Src.Lib.DI;

/// <summary>
/// Validates discovered [Service] attributed classes against DI rules.
/// Fails fast at startup if any validation rule is violated.
/// </summary>
public static class ServiceValidator {
	// Regex pattern for allowed namespace: MainApi.Src.Modules.{Domain}.Services
	private static readonly Regex AllowedNamespacePattern = new(
		@"^MainApi\.Src\.Modules\.[^.]+\.Services(\..*)?$",
		RegexOptions.Compiled
	);

	// Keys must be stable identifiers (no whitespace/control chars), and must be lowercase.
	// Allowed: a-z, 0-9, underscore, hyphen, dot. Must start with a-z or 0-9.
	private static readonly Regex KeyPattern = new(
		@"^[a-z0-9][a-z0-9._-]*$",
		RegexOptions.Compiled
	);

	/// <summary>
	/// Validates all discovered services and throws if any rule is violated.
	/// </summary>
	/// <exception cref="InvalidOperationException">Thrown when validation fails.</exception>
	public static void Validate(List<DiscoveredService> services) {
		var errors = new List<string>();

		// Rule 1: Concrete classes only (no abstract, no open generics)
		ValidateConcreteClasses(services, errors);

		// Rule 2: Namespace allowlist enforcement
		ValidateNamespaces(services, errors);

		// Rule 3: Primary interface existence check
		ValidatePrimaryInterfaces(services, errors);

		// Rule 4: Key validity (no empty/whitespace, must be lowercase)
		ValidateKeys(services, errors);

		// Rule 5: Duplicate unkeyed implementation detection
		ValidateNoDuplicateUnkeyed(services, errors);

		// Rule 6: Duplicate key detection per service type
		ValidateNoDuplicateKeys(services, errors);

		if (errors.Count > 0) {
			var message = new StringBuilder();
			message.AppendLine("[Service] attribute validation failed with the following errors:");
			message.AppendLine();
			foreach (var error in errors) {
				message.AppendLine($"  - {error}");
			}
			throw new InvalidOperationException(message.ToString());
		}
	}

	/// <summary>
	/// Validates that all [Service] attributed types are concrete classes (not abstract, not open generics).
	/// </summary>
	private static void ValidateConcreteClasses(List<DiscoveredService> services, List<string> errors) {
		foreach (var service in services) {
			var type = service.ImplementationType;

			if (!type.IsClass) {
				errors.Add(
					$"[Service] attribute on '{type.FullName}' is invalid: " +
					$"type is not a class. [Service] may only be used on concrete classes."
				);
			}

			if (type.IsAbstract) {
				errors.Add(
					$"[Service] attribute on '{type.FullName}' is invalid: " +
					$"type is abstract. [Service] may only be used on concrete classes."
				);
			}

			if (type.IsGenericTypeDefinition) {
				errors.Add(
					$"[Service] attribute on '{type.FullName}' is invalid: " +
					$"type is an open generic. [Service] may only be used on concrete classes."
				);
			}

			// Covers nested types inside generic outer types, and other unconstructible generic cases.
			if (type.ContainsGenericParameters) {
				errors.Add(
					$"[Service] attribute on '{type.FullName}' is invalid: " +
					$"type contains unassigned generic parameters and is not constructible."
				);
			}
		}
	}

	/// <summary>
	/// Validates that all [Service] attributed classes are in allowed namespaces.
	/// </summary>
	private static void ValidateNamespaces(List<DiscoveredService> services, List<string> errors) {
		foreach (var service in services) {
			if (!AllowedNamespacePattern.IsMatch(service.Namespace)) {
				errors.Add(
					$"[Service] attribute on '{service.ImplementationType.FullName}' is invalid: " +
					$"namespace '{service.Namespace}' is not allowed. " +
					$"[Service] may only be used on classes under 'MainApi.Src.Modules.*.Services'."
				);
			}
		}
	}

	/// <summary>
	/// Validates that all [Service] attributed classes have a primary interface I{ClassName}.
	/// </summary>
	private static void ValidatePrimaryInterfaces(List<DiscoveredService> services, List<string> errors) {
		foreach (var service in services) {
			if (service.ServiceInterface is null) {
				var expectedInterfaceName = $"I{service.ImplementationType.Name}";
				var suffix = service.InterfaceResolutionError is null ? "" : $" ({service.InterfaceResolutionError})";
				errors.Add(
					$"[Service] attribute on '{service.ImplementationType.FullName}' is invalid: " +
					$"primary interface resolution failed for '{expectedInterfaceName}'.{suffix}"
				);
				continue;
			}

			if (service.ServiceInterface.ContainsGenericParameters) {
				errors.Add(
					$"[Service] attribute on '{service.ImplementationType.FullName}' is invalid: " +
					$"primary interface '{service.ServiceInterface.FullName}' contains unassigned generic parameters."
				);
			}
		}
	}

	/// <summary>
	/// Validates that keys are valid (not empty/whitespace, lowercase only, identifier-safe).
	/// </summary>
	private static void ValidateKeys(List<DiscoveredService> services, List<string> errors) {
		foreach (var service in services) {
			if (service.Key is null) {
				continue;
			}

			if (string.IsNullOrWhiteSpace(service.Key)) {
				errors.Add(
					$"[Service] attribute on '{service.ImplementationType.FullName}' has invalid key: " +
					$"key cannot be empty or whitespace. Use null for unkeyed registration."
				);
				continue;
			}

			if (service.Key != service.Key.ToLowerInvariant()) {
				errors.Add(
					$"[Service] attribute on '{service.ImplementationType.FullName}' has invalid key: " +
					$"'{service.Key}' must be lowercase. Keys must be lowercase identifiers."
				);
			}

			if (service.Key != service.Key.Trim()) {
				errors.Add(
					$"[Service] attribute on '{service.ImplementationType.FullName}' has invalid key: " +
					$"'{service.Key}' must not contain leading/trailing whitespace."
				);
				continue;
			}

			if (!KeyPattern.IsMatch(service.Key)) {
				errors.Add(
					$"[Service] attribute on '{service.ImplementationType.FullName}' has invalid key: " +
					$"'{service.Key}' is not identifier-safe. Allowed chars: [a-z0-9._-] with no spaces."
				);
			}
		}
	}

	/// <summary>
	/// Validates that each service type has at most one unkeyed (default) implementation.
	/// </summary>
	private static void ValidateNoDuplicateUnkeyed(List<DiscoveredService> services, List<string> errors) {
		// Filter to only services with valid interfaces (not void) and no key
		var unkeyedByInterface = services
			.Where(s => s.ServiceInterface is not null && s.Key is null)
			.GroupBy(s => s.ServiceInterface!)
			.Where(g => g.Count() > 1);

		foreach (var group in unkeyedByInterface) {
			var implementations = string.Join(", ", group.Select(s => s.ImplementationType.Name));
			errors.Add(
				$"Duplicate unkeyed implementations for service type '{group.Key.FullName}': " +
				$"[{implementations}]. " +
				$"Only one unkeyed default is allowed; additional implementations must be keyed."
			);
		}
	}

	/// <summary>
	/// Validates that there are no duplicate keys for the same service type.
	/// </summary>
	private static void ValidateNoDuplicateKeys(List<DiscoveredService> services, List<string> errors) {
		// Filter to only services with valid interfaces and a key
		var keyedByInterfaceAndKey = services
			.Where(s => s.ServiceInterface is not null && s.Key is not null)
			.GroupBy(s => (ServiceInterface: s.ServiceInterface!, Key: s.Key))
			.Where(g => g.Count() > 1);

		foreach (var group in keyedByInterfaceAndKey) {
			var implementations = string.Join(", ", group.Select(s => s.ImplementationType.Name));
			errors.Add(
				$"Duplicate key '{group.Key.Key}' for service type '{group.Key.ServiceInterface.FullName}': " +
				$"[{implementations}]. " +
				$"Each key must be unique per service type."
			);
		}
	}

	/// <summary>
	/// Formats the discovered services manifest for logging (optional diagnostic).
	/// </summary>
	public static string? FormatManifest(List<DiscoveredService> services) {
		if (services.Count == 0) return null;

		var sb = new StringBuilder();
		sb.AppendLine($"[DI Manifest] Discovered {services.Count} [Service] attributed class(es):");

		foreach (var service in services.OrderBy(s => s.ImplementationType.FullName)) {
			if (service.ServiceInterface is null) continue;
			var keyInfo = service.Key is not null ? $", Key=\"{service.Key}\"" : "";
			sb.AppendLine(
				$"  - {service.ImplementationType.Name} -> {service.ServiceInterface.Name} " +
				$"({service.Lifetime}{keyInfo})"
			);
		}

		return sb.ToString();
	}

	/// <summary>
	/// Logs a summary of discovered services (optional diagnostic).
	/// </summary>
	public static void LogManifest(List<DiscoveredService> services, ILogger logger) {
		if (!logger.IsEnabled(LogLevel.Information)) return;

		var manifest = FormatManifest(services);
		if (manifest is null) return;

		logger.LogInformation("{Manifest}", manifest);
	}
}
