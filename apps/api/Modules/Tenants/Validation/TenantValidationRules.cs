using System.Text.Json;
using System.Text.RegularExpressions;

using FluentValidation;

namespace PublyApp.Api.Modules.Tenants.Validation;

/// <summary>
/// Tenant domain-specific validation rules for JsonElement fields.
/// These rules depend on tenant-specific allowlists (locale) and
/// the host IANA time zone database (timezone).
/// </summary>
public static partial class TenantValidationRules {
	// Wire contract: lowercase locale tokens. Drives future invitation-email
	// language selection — not wired to any behavior yet.
	private static readonly HashSet<string> AllowedLocales =
		new(StringComparer.OrdinalIgnoreCase) { "en", "fr" };

	public const int LogoUrlMaxLength = 2048;

	// Matches exactly what CreateStaffUpload returns (see StaffUploadCreated.Url):
	// "/files/" + the server-generated relative storage path.
	[GeneratedRegex(@"^/files/uploads/\d{4}/\d{2}/[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$")]
	private static partial Regex ServedUploadLogoUrlPattern();

	/// <summary>
	/// True when <paramref name="value"/> is either a served-upload path shaped like
	/// <see cref="ServedUploadLogoUrlPattern"/> or an absolute http(s) URL, and is at
	/// most <see cref="LogoUrlMaxLength"/> characters. Shared by the validators below
	/// and by <c>TenantAsStaffService</c> to detect when a replaced logoUrl points at a
	/// blob this API owns and can safely delete.
	/// </summary>
	public static bool IsServedUploadLogoUrl(string value) {
		return ServedUploadLogoUrlPattern().IsMatch(value);
	}

	private static bool IsValidLogoUrl(string value) {
		if (value.Length > LogoUrlMaxLength) {
			return false;
		}
		if (IsServedUploadLogoUrl(value)) {
			return true;
		}
		return Uri.TryCreate(value, UriKind.Absolute, out var uri)
			&& (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
	}

	/// <summary>
	/// Validates a nullable JsonElement? logoUrl field: null OK, otherwise must be
	/// either a served-upload path (what CreateStaffUpload returns) or an absolute
	/// http(s) URL, at most <see cref="LogoUrlMaxLength"/> characters.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableLogoUrl<T>(
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
				// Whitespace-only is treated as a clear, matching the org-profile
				// fields' NormalizeClearableString mapping to null — GetLogoUrl()
				// routes the String case through the same helper.
				if (string.IsNullOrWhiteSpace(str)) {
					return true;
				}
				return str is not null && IsValidLogoUrl(str);
			})
			.WithMessage(
				"LogoUrl must be a served upload path or an absolute http(s) URL "
				+ $"of at most {LogoUrlMaxLength} characters"
			);
	}

	/// <summary>
	/// Validates a non-nullable JsonElement logoUrl field for PatchField pattern:
	/// Undefined OK (omit), null OK (clear), otherwise must be either a served-upload
	/// path or an absolute http(s) URL, at most <see cref="LogoUrlMaxLength"/> characters.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldLogoUrl<T>(
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
				// Whitespace-only is treated as a clear, matching the org-profile
				// fields' NormalizeClearableString mapping to null — GetLogoUrl()
				// routes the String case through the same helper.
				if (string.IsNullOrWhiteSpace(str)) {
					return true;
				}
				return str is not null && IsValidLogoUrl(str);
			})
			.WithMessage(
				"LogoUrl must be a served upload path or an absolute http(s) URL "
				+ $"of at most {LogoUrlMaxLength} characters, null, or omitted"
			);
	}

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
