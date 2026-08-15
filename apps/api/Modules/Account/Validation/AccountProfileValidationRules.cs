using System.Text.Json;
using System.Text.RegularExpressions;

using FluentValidation;

namespace PublyApp.Api.Modules.Account.Validation;

/// <summary>
/// Account-profile-specific validation rules for JsonElement PatchField URL
/// fields. Mirrors the tenant-logo rule (MustBePatchFieldLogoUrl): a profile
/// avatar may be either a root-relative served-upload path (what
/// CreateStaffUpload returns) or an absolute http(s) URL. Accepting the
/// served-upload path is what lets the frontend persist the root-relative
/// form of same-origin /files/ URLs (toRootRelativeApiFileUrl) instead of
/// baking today's API origin into the stored avatar_url.
/// </summary>
public static partial class AccountProfileValidationRules {
	// Matches exactly what CreateStaffUpload returns (see StaffUploadCreated.Url):
	// "/files/" + the server-generated relative storage path.
	[GeneratedRegex(@"^/files/uploads/\d{4}/\d{2}/[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$")]
	private static partial Regex ServedUploadAvatarUrlPattern();

	/// <summary>
	/// True when <paramref name="value"/> is a served-upload path shaped like
	/// <see cref="ServedUploadAvatarUrlPattern"/>.
	/// </summary>
	public static bool IsServedUploadAvatarUrl(string value) {
		return ServedUploadAvatarUrlPattern().IsMatch(value);
	}

	private static bool IsValidAvatarUrl(string value) {
		if (IsServedUploadAvatarUrl(value)) {
			return true;
		}

		return Uri.TryCreate(value, UriKind.Absolute, out var uri)
			&& (uri.Scheme == Uri.UriSchemeHttp
				|| uri.Scheme == Uri.UriSchemeHttps);
	}

	/// <summary>
	/// Validates a non-nullable JsonElement avatarUrl field for PatchField
	/// pattern: Undefined OK (omit), null OK (clear), otherwise must be either
	/// a served-upload path (what CreateStaffUpload returns) or an absolute
	/// http(s) URL of at most <paramref name="maxLength"/> characters when a
	/// bound is given.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldAvatarUrl<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int? maxLength = null
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
				var url = e.GetString();
				if (string.IsNullOrWhiteSpace(url)) {
					return false;
				}
				return IsValidAvatarUrl(url);
			})
			.WithMessage(
				$"{fieldName} must be a served upload path or an absolute "
				+ "http(s) URL, null, or omitted"
			)
			.Must(e => {
				if (maxLength is null || e.ValueKind != JsonValueKind.String) {
					return true;
				}
				return (e.GetString()?.Length ?? 0) <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be {maxLength} characters or less"
			);
	}
}
