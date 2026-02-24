using System.Text.Json;

using FluentValidation;

namespace MainApi.Src.Lib.Validation;

public static class JsonElementRules {
	/// <summary>
	/// Validates a required JsonElement email field:
	/// NotEmpty → must be string → valid email format.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredEmail<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder
	) {
		return ruleBuilder
			.NotEmpty()
			.WithMessage("Email is required")
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Email must be a string")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return false;
				}
				var email = e.GetString();
				if (string.IsNullOrWhiteSpace(email)) {
					return false;
				}
				return System.Net.Mail.MailAddress
					.TryCreate(email, out _);
			})
			.WithMessage("Invalid email address");
	}

	/// <summary>
	/// Validates a required JsonElement password field:
	/// NotEmpty → must be string → min length from config.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredPassword<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder
	) {
		var minLen = AppEnvironment
			.Instance.PASSWORD_MIN_LENGTH;

		return ruleBuilder
			.NotEmpty()
			.WithMessage("Password is required")
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("Password must be a string")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return false;
				}
				var str = e.GetString();
				return str is not null
					&& str.Length >= minLen;
			})
			.WithMessage(
				"Password must be at least "
				+ $"{minLen} characters long"
			);
	}

	/// <summary>
	/// Validates a required JsonElement string field:
	/// NotEmpty → must be string → non-empty string value.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredString<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName
	) {
		return ruleBuilder
			.NotEmpty()
			.WithMessage($"{fieldName} is required")
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage($"{fieldName} must be a string")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return false;
				}
				var str = e.GetString();
				return !string.IsNullOrWhiteSpace(str);
			})
			.WithMessage(
				$"{fieldName} must not be empty"
			);
	}

	/// <summary>
	/// Validates a nullable JsonElement? string field:
	/// wrapper-null or JSON null OK, otherwise must be String.
	///
	/// RESERVED FOR FUTURE USE: Currently unused in production code.
	/// For optional non-empty strings, use MustBeNullableNonEmptyString instead.
	/// This validator is kept for completeness and will be needed when adding
	/// optional string fields that accept empty/whitespace values.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableString<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder,
			string fieldName
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
				return kind == JsonValueKind.String;
			})
			.WithMessage(
				$"{fieldName} must be a string or null"
			);
	}

	/// <summary>
	/// Validates a nullable JsonElement? that must be a
	/// non-empty string when present (not null/Null/Undefined).
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableNonEmptyString<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder,
			string fieldName
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
				return !string.IsNullOrWhiteSpace(str);
			})
			.WithMessage(
				$"{fieldName} must be a non-empty "
				+ "string or null"
			);
	}

	/// <summary>
	/// Validates a nullable JsonElement? URL field:
	/// null OK, otherwise must be valid http(s) URL.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableUrl<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder,
			string fieldName
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
				var url = e.Value.GetString();
				if (string.IsNullOrWhiteSpace(url)) {
					return false;
				}
				if (!Uri.TryCreate(
					url, UriKind.Absolute, out var result
				)) {
					return false;
				}
				return result.Scheme == Uri.UriSchemeHttp
					|| result.Scheme == Uri.UriSchemeHttps;
			})
			.WithMessage(
				$"{fieldName} must be a valid URL"
			);
	}


	/// <summary>
	/// Validates a nullable JsonElement? boolean field:
	/// wrapper-null or JSON null OK, otherwise must be
	/// True or False.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableBoolean<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder,
			string fieldName
	) {
		return ruleBuilder
			.Must(e => {
				if (e is null) {
					return true;
				}
				return e.Value.ValueKind
					is JsonValueKind.Null
					or JsonValueKind.True
					or JsonValueKind.False;
			})
			.WithMessage(
				$"{fieldName} must be a boolean or null"
			);
	}

	/// <summary>
	/// Validates a nullable JsonElement? email field
	/// for update/patch scenarios: null/Null OK,
	/// otherwise must be valid email format.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableEmail<T>(
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
				var email = e.Value.GetString();
				if (string.IsNullOrWhiteSpace(email)) {
					return false;
				}
				return System.Net.Mail.MailAddress
					.TryCreate(email, out _);
			})
			.WithMessage(
				"Email must be a valid email address"
			);
	}

	/// <summary>
	/// Validates a required JsonElement string field that
	/// must also be a valid encrypted string (for token IDs).
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredEncryptedId<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder
	) {
		return ruleBuilder
			.NotEmpty()
			.WithMessage("ID is required")
			.Must(e => e.ValueKind == JsonValueKind.String)
			.WithMessage("ID must be a string")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return false;
				}
				var str = e.GetString();
				if (string.IsNullOrWhiteSpace(str)) {
					return false;
				}
				return Utils.CryptoUtils
					.IsValidEncryptedString(str);
			})
			.WithMessage("Invalid ID format");
	}
}
