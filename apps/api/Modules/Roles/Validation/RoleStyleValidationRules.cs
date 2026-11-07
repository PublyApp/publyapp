using System.Text.Json;

namespace PublyApp.Api.Modules.Roles.Validation;

public static class RoleStyleValidationRules {
	private const string _IconCatalogResourceName =
		"PublyApp.RoleIcons.json";

	public static readonly IReadOnlySet<string> Icons =
		RoleStyleValidationRules._LoadIconCatalog();

	public static readonly IReadOnlySet<string> Tones = new HashSet<string>(
		["0", "1", "2", "3", "4", "5", "6", "7"],
		StringComparer.Ordinal
	);

	private static IReadOnlySet<string> _LoadIconCatalog() {
		using var stream = typeof(RoleStyleValidationRules)
			.Assembly
			.GetManifestResourceStream(RoleStyleValidationRules._IconCatalogResourceName);
		if (stream is null) {
			throw new InvalidOperationException(
				$"Embedded role icon catalog '{RoleStyleValidationRules._IconCatalogResourceName}' was not found"
			);
		}

		var iconNames = JsonSerializer.Deserialize<List<string>>(stream);
		if (iconNames is null || iconNames.Count == 0) {
			throw new InvalidOperationException(
				"Embedded role icon catalog is empty or invalid"
			);
		}

		var icons = new HashSet<string>(iconNames, StringComparer.Ordinal);
		if (icons.Count != iconNames.Count
			|| icons.Any(string.IsNullOrWhiteSpace)
		) {
			throw new InvalidOperationException(
				"Embedded role icon catalog contains duplicate or empty names"
			);
		}

		return icons;
	}
}
