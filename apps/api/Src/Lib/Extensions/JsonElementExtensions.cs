using System.Runtime.CompilerServices;
using System.Text.Json;

namespace MainApi.Src.Lib.Extensions;

public static class JsonElementExtensions {
	public static string GetValueAsString(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element.ValueKind switch {
			JsonValueKind.String => element.GetString() ?? throw new InvalidOperationException($"{propertyName} is not a string"),
			_ => throw new InvalidOperationException($"{propertyName} is not a string")
		};
	}

	public static string GetValueAsString(this JsonElement? element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
		return element?.ValueKind switch {
			JsonValueKind.String => element?.GetString() ?? throw new InvalidOperationException($"{propertyName} is not a string"),
			_ => throw new InvalidOperationException($"{propertyName} is not a string")
		};
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
}
