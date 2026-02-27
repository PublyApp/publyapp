using System.Runtime.CompilerServices;
using System.Text.Json;

using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Lib.Extensions;

public static class JsonElementExtensions {
	public static string GetValueAsString(
		this JsonElement element,
		[CallerArgumentExpression(nameof(element))]
		string? propertyName = null
	) {
		if (element.ValueKind != JsonValueKind.String) {
			throw new InvalidOperationException(
				$"{propertyName} is not a string"
			);
		}
		var value = element.GetString();
		if (value is null) {
			throw new InvalidOperationException(
				$"{propertyName} is not a string"
			);
		}
		return value;
	}

	public static string GetValueAsString(
		this JsonElement? element,
		[CallerArgumentExpression(nameof(element))]
		string? propertyName = null
	) {
		if (element?.ValueKind != JsonValueKind.String) {
			throw new InvalidOperationException(
				$"{propertyName} is not a string"
			);
		}
		var value = element.Value.GetString();
		if (value is null) {
			throw new InvalidOperationException(
				$"{propertyName} is not a string"
			);
		}
		return value;
	}

	public static string? GetValueAsStringOrNull(this JsonElement? element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element?.ValueKind switch {
			null => null,
			JsonValueKind.Null => null,
			JsonValueKind.Undefined => null,
			JsonValueKind.String => element?.GetString(),
			_ => throw new InvalidOperationException($"{propertyName} must be a string or null")
		};
	}

	public static string? GetValueAsStringOrNull(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element.ValueKind switch {
			JsonValueKind.Null => null,
			JsonValueKind.Undefined => null,
			JsonValueKind.String => element.GetString(),
			_ => throw new InvalidOperationException($"{propertyName} must be a string or null")
		};
	}

	public static bool GetValueAsBoolean(this JsonElement? element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element?.ValueKind switch {
			null => false,
			JsonValueKind.Null => false,
			JsonValueKind.Undefined => false,
			JsonValueKind.True => true,
			JsonValueKind.False => false,
			_ => throw new InvalidOperationException($"{propertyName} must be a boolean or null")
		};
	}

	public static bool GetValueAsBoolean(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element.ValueKind switch {
			JsonValueKind.Null => false,
			JsonValueKind.Undefined => false,
			JsonValueKind.True => true,
			JsonValueKind.False => false,
			_ => throw new InvalidOperationException($"{propertyName} must be a boolean or null")
		};
	}

	public static Guid GetValueAsGuid(
		this JsonElement element,
		[CallerArgumentExpression(nameof(element))]
		string? propertyName = null
	) {
		if (element.ValueKind != JsonValueKind.String) {
			throw new InvalidOperationException(
				$"{propertyName} must be a guid"
			);
		}
		var guidStr = element.GetString();
		if (guidStr is null) {
			throw new InvalidOperationException(
				$"{propertyName} is not a guid"
			);
		}
		return Guid.Parse(guidStr);
	}

	public static Guid GetValueAsGuid(
		this JsonElement? element,
		[CallerArgumentExpression(nameof(element))]
		string? propertyName = null
	) {
		if (element is null
			|| element.Value.ValueKind
				is JsonValueKind.Null
				or JsonValueKind.Undefined) {
			throw new InvalidOperationException(
				$"{propertyName} is not a guid"
			);
		}
		if (element.Value.ValueKind
			!= JsonValueKind.String) {
			throw new InvalidOperationException(
				$"{propertyName} must be a guid"
			);
		}
		var guidStr = element.Value.GetString();
		if (guidStr is null) {
			throw new InvalidOperationException(
				$"{propertyName} is not a guid"
			);
		}
		return Guid.Parse(guidStr);
	}

	public static int GetValueAsInt32(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element.ValueKind switch {
			JsonValueKind.Number => element.GetInt32(),
			_ => throw new InvalidOperationException($"{propertyName} must be a number")
		};
	}

	public static int? GetValueAsInt32OrNull(this JsonElement? element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element?.ValueKind switch {
			null => null,
			JsonValueKind.Null => null,
			JsonValueKind.Undefined => null,
			JsonValueKind.Number => element?.GetInt32(),
			_ => throw new InvalidOperationException($"{propertyName} must be a number or null")
		};
	}

	public static int? GetValueAsInt32OrNull(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element.ValueKind switch {
			JsonValueKind.Null => null,
			JsonValueKind.Undefined => null,
			JsonValueKind.Number => element.GetInt32(),
			_ => throw new InvalidOperationException($"{propertyName} must be a number or null")
		};
	}

	public static DateTime GetValueAsDateTime(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		if (element.ValueKind != JsonValueKind.String) {
			throw new InvalidOperationException(
				$"{propertyName} is not a valid date"
			);
		}
		if (!DateUtils.TryParseIsoUtc(
			element.GetString(), out var utc
		)) {
			throw new InvalidOperationException(
				$"{propertyName} is not a valid ISO 8601 date"
			);
		}
		return utc;
	}

	public static DateTime? GetValueAsDateTimeOrNull(this JsonElement? element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element?.ValueKind switch {
			null => null,
			JsonValueKind.Null => null,
			JsonValueKind.Undefined => null,
			JsonValueKind.String => ParseDateTimeUtcOrThrow(
				element?.GetString(), propertyName
			),
			_ => throw new InvalidOperationException(
				$"{propertyName} must be a valid date or null"
			)
		};
	}

	public static DateTime? GetValueAsDateTimeOrNull(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element.ValueKind switch {
			JsonValueKind.Null => null,
			JsonValueKind.Undefined => null,
			JsonValueKind.String => ParseDateTimeUtcOrThrow(
				element.GetString(), propertyName
			),
			_ => throw new InvalidOperationException(
				$"{propertyName} must be a valid date or null"
			)
		};
	}

	private static DateTime ParseDateTimeUtcOrThrow(
		string? raw, string? propertyName
	) {
		if (!DateUtils.TryParseIsoUtc(raw, out var utc)) {
			throw new InvalidOperationException(
				$"{propertyName} is not a valid ISO 8601 date"
			);
		}
		return utc;
	}
}
