using System.Text.RegularExpressions;

namespace PublyApp.Api.Modules.Profiles.Validation;

public static class TenantProfileStyleValidationRules {
	public const int IconMaxLength = 100;

	public static readonly Regex IconPattern = new(
		"^[a-z0-9]+(?:-[a-z0-9]+)*$",
		RegexOptions.CultureInvariant,
		TimeSpan.FromMilliseconds(100)
	);

	public static readonly IReadOnlySet<string> Tones = new HashSet<string>(
		["0", "1", "2", "3", "4", "5", "6", "7"],
		StringComparer.Ordinal
	);
}
