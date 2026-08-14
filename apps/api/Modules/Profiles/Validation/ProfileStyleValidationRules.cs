using System.Text.Json;

namespace PublyApp.Api.Modules.Profiles.Validation;

public static class ProfileStyleValidationRules {
	private const string IconCatalogResourceName =
		"PublyApp.ProfileIcons.json";

	public static readonly IReadOnlySet<string> Icons =
		LoadIconCatalog();

	public static readonly IReadOnlySet<string> Tones = new HashSet<string>(
		["0", "1", "2", "3", "4", "5", "6", "7"],
		StringComparer.Ordinal
	);

	private static IReadOnlySet<string> LoadIconCatalog() {
		using var stream = typeof(ProfileStyleValidationRules)
			.Assembly
			.GetManifestResourceStream(IconCatalogResourceName);
		if (stream is null) {
			throw new InvalidOperationException(
				$"Embedded profile icon catalog '{IconCatalogResourceName}' was not found"
			);
		}

		var iconNames = JsonSerializer.Deserialize<List<string>>(stream);
		if (iconNames is null || iconNames.Count == 0) {
			throw new InvalidOperationException(
				"Embedded profile icon catalog is empty or invalid"
			);
		}

		var icons = new HashSet<string>(iconNames, StringComparer.Ordinal);
		if (icons.Count != iconNames.Count
			|| icons.Any(string.IsNullOrWhiteSpace)
		) {
			throw new InvalidOperationException(
				"Embedded profile icon catalog contains duplicate or empty names"
			);
		}

		return icons;
	}
}
