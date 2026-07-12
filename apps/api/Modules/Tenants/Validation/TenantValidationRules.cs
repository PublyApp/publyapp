using System.Text.Json;

using FluentValidation;

namespace PublyApp.Api.Modules.Tenants.Validation;

/// <summary>
/// Tenant domain-specific validation rules for JsonElement fields.
/// These rules depend on tenant-specific allowlists (locale) and
/// the host IANA time zone database (timezone).
/// </summary>
public static class TenantValidationRules {
	// Wire contract: lowercase locale tokens. Drives future invitation-email
	// language selection — not wired to any behavior yet.
	private static readonly HashSet<string> AllowedLocales =
		new(StringComparer.OrdinalIgnoreCase) { "en", "fr" };

	/// <summary>
	/// Validates a nullable JsonElement? locale field: null OK, otherwise
	/// must be one of the allowed wire locale values ("en"/"fr").
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableLocale<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder
		) {
		return ruleBuilder
			.Must(e => {
				if (e is null) {
					return true;
				}
				var kind = e.Value.ValueKind;
				if (kind is JsonValueKind.Null) {
					return true;
				}
				if (kind != JsonValueKind.String) {
					return false;
				}
				var str = e.Value.GetString();
				return str is not null && AllowedLocales.Contains(str);
			})
			.WithMessage("DefaultLocale must be 'en' or 'fr'");
	}

	/// <summary>
	/// Validates a non-nullable JsonElement locale field for PatchField pattern:
	/// Undefined OK (omit), null OK (clear), otherwise must be one of the
	/// allowed wire locale values ("en"/"fr").
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldLocale<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder
		) {
		return ruleBuilder
			.Must(e => {
				var kind = e.ValueKind;
				if (kind is JsonValueKind.Undefined or JsonValueKind.Null) {
					return true;
				}
				if (kind != JsonValueKind.String) {
					return false;
				}
				var str = e.GetString();
				return str is not null && AllowedLocales.Contains(str);
			})
			.WithMessage("DefaultLocale must be 'en', 'fr', null, or omitted");
	}

	/// <summary>
	/// Validates a nullable JsonElement? IANA time zone id field: null OK,
	/// otherwise must resolve via <see cref="TimeZoneInfo.TryFindSystemTimeZoneById"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableTimezone<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder
		) {
		return ruleBuilder
			.Must(e => {
				if (e is null) {
					return true;
				}
				var kind = e.Value.ValueKind;
				if (kind is JsonValueKind.Null) {
					return true;
				}
				if (kind != JsonValueKind.String) {
					return false;
				}
				var str = e.Value.GetString();
				return str is not null
					&& TimeZoneInfo.TryFindSystemTimeZoneById(str, out _);
			})
			.WithMessage("Timezone must be a valid IANA time zone identifier");
	}

	/// <summary>
	/// Validates a non-nullable JsonElement IANA time zone id field for PatchField
	/// pattern: Undefined OK (omit), null OK (clear), otherwise must resolve via
	/// <see cref="TimeZoneInfo.TryFindSystemTimeZoneById"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldTimezone<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder
		) {
		return ruleBuilder
			.Must(e => {
				var kind = e.ValueKind;
				if (kind is JsonValueKind.Undefined or JsonValueKind.Null) {
					return true;
				}
				if (kind != JsonValueKind.String) {
					return false;
				}
				var str = e.GetString();
				return str is not null
					&& TimeZoneInfo.TryFindSystemTimeZoneById(str, out _);
			})
			.WithMessage(
				"Timezone must be a valid IANA time zone identifier, null, or omitted"
			);
	}
}
