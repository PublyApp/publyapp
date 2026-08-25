using System.Text.Json;
using System.Text.RegularExpressions;

using FluentValidation;

using PublyApp.Api.Lib.Utils;

namespace PublyApp.Api.Lib.Validation;

public static class JsonElementRules {
	/// <summary>
	/// Validates an optional, clearable string against a maximum length and pattern.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldStringMatchingPattern<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int maxLength,
			Regex pattern,
			string formatDescription
		) {
		return ruleBuilder
			.Must(e => e.ValueKind
				is JsonValueKind.Undefined
				or JsonValueKind.Null
				or JsonValueKind.String)
			.WithMessage($"{fieldName} must be a string, null, or omitted")
			.Must(e => e.ValueKind != JsonValueKind.String
				|| !string.IsNullOrWhiteSpace(e.GetString()))
			.WithMessage($"{fieldName} must not be empty")
			.Must(e => e.ValueKind != JsonValueKind.String
				|| (e.GetString()?.Length ?? 0) <= maxLength)
			.WithMessage($"{fieldName} must be {maxLength} characters or less")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return true;
				}

				var value = e.GetString();
				return value is not null && pattern.IsMatch(value);
			})
			.WithMessage($"{fieldName} must {formatDescription}");
	}

	/// <summary>
	/// Validates an optional, clearable string against a finite set of allowed values.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldStringInSet<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			IReadOnlySet<string> allowedValues
		) {
		return ruleBuilder
			.Must(e => e.ValueKind
				is JsonValueKind.Undefined
				or JsonValueKind.Null
				or JsonValueKind.String)
			.WithMessage($"{fieldName} must be a string, null, or omitted")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return true;
				}

				var value = e.GetString();
				return value is not null && allowedValues.Contains(value);
			})
			.WithMessage(
				$"{fieldName} must be one of: {string.Join(", ", allowedValues)}"
			);
	}

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
	/// For optional non-empty strings, use MustBeNullableNonEmptyString instead.
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
	/// Validates a nullable JsonElement? URL field where blank/whitespace-only
	/// input is treated as a clear (valid), for fields whose handler getter
	/// normalizes blank to null before persisting (e.g. NormalizeClearableString).
	/// Do not use this for fields whose getter does no such normalization —
	/// use <see cref="MustBeNullableUrl{T}"/> there instead.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableClearableUrl<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder,
			string fieldName,
			int? maxLength = null
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
					return true;
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
			)
			.Must(e => {
				if (maxLength is null || e is null || e.Value.ValueKind != JsonValueKind.String) {
					return true;
				}
				return (e.Value.GetString()?.Length ?? 0) <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be {maxLength} characters or less"
			);
	}

	/// <summary>
	/// Validates a non-nullable JsonElement URL field for PatchField pattern:
	/// Undefined OK (omit), null OK (clear), otherwise must be valid http(s) URL
	/// of at most <paramref name="maxLength"/> characters when a bound is given.
	/// Blank input is not a valid clear — use
	/// <see cref="MustBePatchFieldClearableUrl{T}"/> for fields whose getter
	/// normalizes blank to null.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldUrl<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int? maxLength = null
	) {
		return ruleBuilder
			.Must(e => {
				var kind = e.ValueKind;
				if (kind is JsonValueKind.Undefined) {
					return true;
				}
				if (kind is JsonValueKind.Null) {
					return true;
				}
				if (kind is not JsonValueKind.String) {
					return false;
				}
				var url = e.GetString();
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
				$"{fieldName} must be a string, null, or omitted"
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

	/// <summary>
	/// Validates a non-nullable JsonElement URL field for PatchField pattern where
	/// blank/whitespace-only input is treated as a clear (valid), for fields whose
	/// handler getter normalizes blank to null before persisting (e.g.
	/// NormalizeClearableString). Do not use this for fields whose getter does no
	/// such normalization — use <see cref="MustBePatchFieldUrl{T}"/> there instead.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldClearableUrl<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int? maxLength = null
	) {
		return ruleBuilder
			.Must(e => {
				var kind = e.ValueKind;
				if (kind is JsonValueKind.Undefined) {
					return true;
				}
				if (kind is JsonValueKind.Null) {
					return true;
				}
				if (kind is not JsonValueKind.String) {
					return false;
				}
				var url = e.GetString();
				if (string.IsNullOrWhiteSpace(url)) {
					return true;
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
				$"{fieldName} must be a string, null, or omitted"
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

	/// <summary>
	/// Validates a non-nullable JsonElement string field for PatchField pattern:
	/// Undefined OK (omit), null OK (clear), otherwise must be a non-empty string.
	/// When <paramref name="maxLength"/> is set, the raw (untrimmed) length must
	/// not exceed it.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldString<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int? maxLength = null
	) {
		return ruleBuilder
			.Must(e => {
				var kind = e.ValueKind;
				if (kind is JsonValueKind.Undefined) {
					return true;
				}
				if (kind is JsonValueKind.Null) {
					return true;
				}
				if (kind is not JsonValueKind.String) {
					return false;
				}
				var str = e.GetString();
				return !string.IsNullOrWhiteSpace(str);
			})
			.WithMessage(
				$"{fieldName} must be a non-empty string, null, or omitted"
			)
			.Must(e => {
				if (e.ValueKind is not JsonValueKind.String || maxLength is null) {
					return true;
				}
				return (e.GetString()?.Length ?? 0) <= maxLength.Value;
			})
			.WithMessage(
				$"{fieldName} must be at most {maxLength} characters long"
			);
	}

	/// <summary>
	/// Validates a non-nullable JsonElement string field for PATCH-like scenarios:
	/// Undefined OK (omit), null OK, otherwise must be a string.
	/// Use this when the endpoint wants to preserve nullable-string semantics while
	/// still using the shared JsonElement shape check.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldNullableString<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName
	) {
		return ruleBuilder
			.Must(e => {
				var kind = e.ValueKind;
				return kind is JsonValueKind.Undefined
					or JsonValueKind.Null
					or JsonValueKind.String;
			})
			.WithMessage(
				$"{fieldName} must be a string, null, or omitted"
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
	/// Validates a nullable JsonElement? email field with a bounded length:
	/// wrapper-null or JSON null OK; otherwise must be a valid email address whose
	/// length is at most <paramref name="maxLength"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableEmailWithMaxLength<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder,
			string fieldName,
			int maxLength
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
				// Whitespace-only is treated as a clear, matching the handler's
				// NormalizeClearableString mapping to null — not a validation failure.
				if (string.IsNullOrWhiteSpace(email)) {
					return true;
				}
				return System.Net.Mail.MailAddress
					.TryCreate(email, out _);
			})
			.WithMessage(
				$"{fieldName} must be a valid email address"
			)
			.Must(e => {
				if (e is null || e.Value.ValueKind != JsonValueKind.String) {
					return true;
				}
				return (e.Value.GetString()?.Length ?? 0) <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be at most {maxLength} characters long"
			);
	}

	/// <summary>
	/// Validates a non-nullable JsonElement email field for PatchField pattern with a
	/// bounded length: Undefined OK (omit), null OK (clear), otherwise must be a valid
	/// email address whose length is at most <paramref name="maxLength"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldEmailWithMaxLength<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int maxLength
	) {
		return ruleBuilder
			.Must(e => {
				var kind = e.ValueKind;
				if (kind is JsonValueKind.Undefined or JsonValueKind.Null) {
					return true;
				}
				if (kind is not JsonValueKind.String) {
					return false;
				}
				var email = e.GetString();
				// Whitespace-only is treated as a clear, matching the handler's
				// NormalizeClearableString mapping to null — not a validation failure.
				if (string.IsNullOrWhiteSpace(email)) {
					return true;
				}
				return System.Net.Mail.MailAddress
					.TryCreate(email, out _);
			})
			.WithMessage(
				$"{fieldName} must be a valid email address, null, or omitted"
			)
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return true;
				}
				return (e.GetString()?.Length ?? 0) <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be at most {maxLength} characters long"
			);
	}

	/// <summary>
	/// Validates a required JsonElement GUID array field:
	/// required → array → non-empty → bounded size → every item is a GUID string.
	/// When <paramref name="nameInvalidItems"/> is true, malformed elements each get
	/// their own failure naming the offending value (transparent failure cause)
	/// instead of one blanket "every item" message.
	/// </summary>
	// Returns IRuleBuilder because the two modes end in sibling FluentValidation
	// interfaces (default → IRuleBuilderOptions, nameInvalidItems →
	// IRuleBuilderOptionsConditions via .Custom). No caller chains further
	// rules off the return value.
	public static IRuleBuilder<T, JsonElement>
		MustBeRequiredGuidArray<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			string itemName,
			int maxCount,
			bool nameInvalidItems = false
	) {
		var options = ruleBuilder
			.Must(element =>
				element.ValueKind
				is not JsonValueKind.Undefined
				and not JsonValueKind.Null
			)
			.WithMessage($"{fieldName} is required")
			.Must(element => element.ValueKind == JsonValueKind.Array)
			.WithMessage($"{fieldName} must be an array")
			.Must(element =>
				element.ValueKind == JsonValueKind.Array
				&& element.EnumerateArray().Any()
			)
			.WithMessage($"At least one {itemName} is required")
			.Must(element =>
				element.ValueKind == JsonValueKind.Array
				&& element.EnumerateArray().Count() <= maxCount
			)
			.WithMessage($"Maximum {maxCount} {fieldName} allowed");

		if (!nameInvalidItems) {
			return options
				.Must(element =>
					element.ValueKind == JsonValueKind.Array
					&& element.EnumerateArray().All(item =>
						item.ValueKind == JsonValueKind.String
						&& item.TryGetGuid(out _)
					)
				)
				.WithMessage($"Every {itemName} must be a valid GUID");
		}

		// Transparent-failure-cause mode (#1413): one failure per offending
		// element, naming the raw value in plain words, so the 422 tells the
		// caller WHICH item was malformed instead of a blanket "every item"
		// message. Structural rules above stay unchanged.
		return options.Custom((element, context) => {
			if (element.ValueKind != JsonValueKind.Array) {
				return;
			}

			foreach (var item in element.EnumerateArray()) {
				var raw = item.ValueKind == JsonValueKind.String
					? item.GetString()
					: null;

				if (raw is not null && Guid.TryParse(raw, out _)) {
					continue;
				}

				context.AddFailure(
					fieldName,
					$"'{raw ?? item.GetRawText()}' is not a valid {itemName}"
				);
			}
		});
	}

	/// <summary>
	/// Validates a required JsonElement GUID array field that allows an empty array:
	/// required → array → bounded size → every item is a GUID string. Unlike
	/// <see cref="MustBeRequiredGuidArray{T}"/>, this does NOT require at least one item — use
	/// it for batch-read/resolve-style endpoints where an empty array is a valid "resolve
	/// nothing" request rather than a validation error.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredGuidArrayAllowingEmpty<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			string itemName,
			int maxCount
	) {
		return ruleBuilder
			.Must(element =>
				element.ValueKind
				is not JsonValueKind.Undefined
				and not JsonValueKind.Null
			)
			.WithMessage($"{fieldName} is required")
			.Must(element => element.ValueKind == JsonValueKind.Array)
			.WithMessage($"{fieldName} must be an array")
			.Must(element =>
				element.ValueKind == JsonValueKind.Array
				&& element.EnumerateArray().Count() <= maxCount
			)
			.WithMessage($"Maximum {maxCount} {fieldName} allowed")
			.Must(element =>
				element.ValueKind == JsonValueKind.Array
				&& element.EnumerateArray().All(item =>
					item.ValueKind == JsonValueKind.String
					&& item.TryGetGuid(out _)
				)
			)
			.WithMessage($"Every {itemName} must be a valid GUID");
	}

	/// <summary>
	/// Validates a required JsonElement string array field that allows an empty array:
	/// required → array → bounded size → every item is a bounded non-empty string.
	/// Use it for batch-read/resolve-style endpoints where an empty array is a valid
	/// "resolve nothing" request rather than a validation error.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredStringArrayAllowingEmpty<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			string itemName,
			int maxCount,
			int maxItemLength = 200
		) {
		return ruleBuilder
			.Must(element =>
				element.ValueKind
				is not JsonValueKind.Undefined
				and not JsonValueKind.Null
			)
			.WithMessage($"{fieldName} is required")
			.Must(element => element.ValueKind == JsonValueKind.Array)
			.WithMessage($"{fieldName} must be an array")
			.Must(element =>
				element.ValueKind == JsonValueKind.Array
				&& element.EnumerateArray().Count() <= maxCount
			)
			.WithMessage($"Maximum {maxCount} {fieldName} allowed")
			// Each Must runs independently of the previous ones (no short-circuit), so
			// every array-walking predicate must tolerate non-array kinds itself.
			.Must(element =>
				element.ValueKind != JsonValueKind.Array
				|| element.EnumerateArray().All(BeNonEmptyString)
			)
			.WithMessage($"Every {itemName} must be a non-empty string")
			.Must(element =>
				element.ValueKind != JsonValueKind.Array
				|| element.EnumerateArray().All(BeBoundedString)
			)
			.WithMessage(
				$"Every {itemName} must be {maxItemLength} characters or less"
			);

		bool BeNonEmptyString(JsonElement item) {
			if (item.ValueKind != JsonValueKind.String) {
				return false;
			}

			var value = item.GetString();
			return !string.IsNullOrWhiteSpace(value);
		}

		bool BeBoundedString(JsonElement item) {
			if (item.ValueKind != JsonValueKind.String) {
				return false;
			}

			return (item.GetString()?.Length ?? 0) <= maxItemLength;
		}
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

	/// <summary>
	/// Validates a required JsonElement string field with a bounded length:
	/// NotEmpty → must be string → non-empty → length in [minLength, maxLength].
	/// Pass <paramref name="minLength"/> ≤ 1 to enforce only non-emptiness, and
	/// <c>int.MaxValue</c> for <paramref name="maxLength"/> to leave the upper bound open.
	/// When <paramref name="trim"/> is <c>true</c>, the min/max checks use the trimmed length;
	/// otherwise raw length is used (default).
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredStringWithLength<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int minLength,
			int maxLength,
			bool trim = false
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
				return !string.IsNullOrWhiteSpace(e.GetString());
			})
			.WithMessage($"{fieldName} must not be empty")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String || minLength <= 1) {
					return true;
				}
				return (trim ? (e.GetString()?.Trim().Length ?? 0) : (e.GetString()?.Length ?? 0)) >= minLength;
			})
			.WithMessage(
				$"{fieldName} must be at least {minLength} characters long"
			)
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return true;
				}
				return (trim ? (e.GetString()?.Trim().Length ?? 0) : (e.GetString()?.Length ?? 0)) <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be at most {maxLength} characters long"
			);
	}

	/// <summary>
	/// Validates a PATCH-style JsonElement string field with a bounded length:
	/// Undefined OK (omit), otherwise must be a non-empty string whose length is
	/// in [minLength, maxLength]. Null is rejected (use a nullable helper to allow clears).
	/// When <paramref name="trim"/> is <c>true</c>, the min/max checks use the trimmed length;
	/// otherwise raw length is used (default).
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldStringWithLength<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int minLength,
			int maxLength,
			bool trim = false
	) {
		return ruleBuilder
			.Must(e => e.ValueKind
				is JsonValueKind.Undefined
				or JsonValueKind.String)
			.WithMessage($"{fieldName} must be a string")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return true;
				}
				return !string.IsNullOrWhiteSpace(e.GetString());
			})
			.WithMessage($"{fieldName} cannot be empty")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String || minLength <= 1) {
					return true;
				}
				return (trim ? (e.GetString()?.Trim().Length ?? 0) : (e.GetString()?.Length ?? 0)) >= minLength;
			})
			.WithMessage(
				$"{fieldName} must be at least {minLength} characters long"
			)
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return true;
				}
				return (trim ? (e.GetString()?.Trim().Length ?? 0) : (e.GetString()?.Length ?? 0)) <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be at most {maxLength} characters long"
			);
	}

	/// <summary>
	/// Validates a nullable JsonElement? string field with an upper length bound:
	/// wrapper-null or JSON null OK; otherwise must be a string whose length is
	/// ≤ <paramref name="maxLength"/>. Empty/whitespace strings are allowed.
	/// When <paramref name="trim"/> is <c>true</c>, the max check uses the trimmed length;
	/// otherwise raw length is used (default).
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableStringWithMaxLength<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder,
			string fieldName,
			int maxLength,
			bool trim = false
	) {
		return ruleBuilder
			.Must(e => {
				if (e is null) {
					return true;
				}
				return e.Value.ValueKind
					is JsonValueKind.Null
					or JsonValueKind.String;
			})
			.WithMessage($"{fieldName} must be a string or null")
			.Must(e => {
				if (e is null
					|| e.Value.ValueKind != JsonValueKind.String) {
					return true;
				}
				return (trim ? (e.Value.GetString()?.Trim().Length ?? 0) : (e.Value.GetString()?.Length ?? 0)) <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be {maxLength} characters or less"
			);
	}

	/// <summary>
	/// Validates a PATCH-style JsonElement string field with an upper length bound:
	/// Undefined OK (omit), JSON null OK (clear); otherwise must be a string whose length is
	/// ≤ <paramref name="maxLength"/>. Empty/whitespace strings are allowed.
	/// When <paramref name="trim"/> is <c>true</c>, the max check uses the trimmed length;
	/// otherwise raw length is used (default).
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldStringWithMaxLength<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int maxLength,
			bool trim = false
	) {
		return ruleBuilder
			.Must(e => e.ValueKind
				is JsonValueKind.Undefined
				or JsonValueKind.Null
				or JsonValueKind.String)
			.WithMessage($"{fieldName} must be a string, null, or omitted")
			.Must(e => {
				if (e.ValueKind != JsonValueKind.String) {
					return true;
				}
				return (trim ? (e.GetString()?.Trim().Length ?? 0) : (e.GetString()?.Length ?? 0)) <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be {maxLength} characters or less"
			);
	}

	/// <summary>
	/// Validates a nullable JsonElement? GUID field:
	/// wrapper-null/Undefined/null OK; otherwise must be a non-empty GUID string.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableNonEmptyGuid<T>(
			this IRuleBuilder<T, JsonElement?> ruleBuilder,
			string fieldName
		) {
		return ruleBuilder
			.Must(e => {
				if (e is null) {
					return true;
				}
				var kind = e.Value.ValueKind;
				if (kind is JsonValueKind.Undefined or JsonValueKind.Null) {
					return true;
				}
				if (kind is not JsonValueKind.String) {
					return false;
				}
				var raw = e.Value.GetString();
				if (string.IsNullOrWhiteSpace(raw)) {
					return false;
				}
				if (!Guid.TryParse(raw, out var guid)) {
					return false;
				}
				return guid != Guid.Empty;
			})
			.WithMessage($"{fieldName} must be a valid GUID");
	}

	/// <summary>
	/// Validates a non-nullable JsonElement GUID field for PatchField pattern:
	/// Undefined OK (omit), null OK (clear), otherwise must be a non-empty GUID string.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldNonEmptyGuid<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName
		) {
		return ruleBuilder
			.Must(e => {
				var kind = e.ValueKind;
				if (kind is JsonValueKind.Undefined or JsonValueKind.Null) {
					return true;
				}
				if (kind is not JsonValueKind.String) {
					return false;
				}
				var raw = e.GetString();
				if (string.IsNullOrWhiteSpace(raw)) {
					return false;
				}
				if (!Guid.TryParse(raw, out var guid)) {
					return false;
				}
				return guid != Guid.Empty;
			})
			.WithMessage($"{fieldName} must be a valid GUID, null, or omitted");
	}

	/// <summary>
	/// Validates a required JsonElement ISO 8601 UTC datetime field:
	/// NotEmpty → must be string → parses via <see cref="DateUtils.TryParseIsoUtc"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredIsoDateTime<T>(
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
				return DateUtils.TryParseIsoUtc(e.GetString(), out _);
			})
			.WithMessage($"{fieldName} must be a valid ISO 8601 date");
	}

	/// <summary>
	/// Validates a nullable JsonElement? ISO 8601 UTC datetime field:
	/// wrapper-null or JSON null OK; otherwise must be a string that parses via
	/// <see cref="DateUtils.TryParseIsoUtc"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement?>
		MustBeNullableIsoDateTime<T>(
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
					or JsonValueKind.String;
			})
			.WithMessage($"{fieldName} must be a string or null")
			.Must(e => {
				if (e is null
					|| e.Value.ValueKind == JsonValueKind.Null) {
					return true;
				}
				if (e.Value.ValueKind != JsonValueKind.String) {
					return false;
				}
				return DateUtils.TryParseIsoUtc(e.Value.GetString(), out _);
			})
			.WithMessage($"{fieldName} must be a valid ISO 8601 date");
	}

	/// <summary>
	/// Validates a PATCH-style JsonElement ISO 8601 UTC datetime field:
	/// Undefined OK (omit), JSON null OK (clear); otherwise must be a string that parses
	/// via <see cref="DateUtils.TryParseIsoUtc"/>.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBePatchFieldIsoDateTime<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName
	) {
		return ruleBuilder
			.Must(e => e.ValueKind
				is JsonValueKind.Undefined
				or JsonValueKind.Null
				or JsonValueKind.String)
			.WithMessage($"{fieldName} must be a string, null, or omitted")
			.Must(e => {
				if (e.ValueKind
					is JsonValueKind.Undefined
					or JsonValueKind.Null) {
					return true;
				}
				if (e.ValueKind != JsonValueKind.String) {
					return false;
				}
				return DateUtils.TryParseIsoUtc(e.GetString(), out _);
			})
			.WithMessage($"{fieldName} must be a valid ISO 8601 date");
	}

	/// <summary>
	/// Validates a REQUIRED JsonElement IANA time zone field: required → string →
	/// non-blank → bounded to <paramref name="maxLength"/> characters → resolvable via
	/// <see cref="TimeZoneInfo.TryFindSystemTimeZoneById(string?, out TimeZoneInfo?)"/>.
	/// The required sibling of the patch-field validators in TenantValidationRules;
	/// D3's schedule endpoint uses it with PublicationSchedule.MaxTimeZoneLength so the
	/// wire validator and the stored column share one bound.
	/// </summary>
	public static IRuleBuilderOptions<T, JsonElement>
		MustBeRequiredTimezone<T>(
			this IRuleBuilder<T, JsonElement> ruleBuilder,
			string fieldName,
			int maxLength = 64
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
				var raw = e.GetString();
				return raw is not null
					&& raw.Trim().Length > 0
					&& raw.Trim().Length <= maxLength;
			})
			.WithMessage(
				$"{fieldName} must be a non-empty IANA identifier of at most "
					+ $"{maxLength} characters"
			)
			.Must(e => e.ValueKind == JsonValueKind.String
				&& TimeZoneInfo.TryFindSystemTimeZoneById(
					e.GetString() ?? string.Empty, out _
				))
			.WithMessage(
				$"{fieldName} must be a valid IANA time zone identifier"
			);
	}

}
