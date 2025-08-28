using System.Text.Json;
using FluentValidation;
using System.Runtime.CompilerServices;

namespace MainApi.Src.Lib.Extensions;

public static class JsonElementExtensions
{
	public static T GetValidatedValue<T>(this JsonElement element, [CallerArgumentExpression(nameof(element))] string fieldName = "")
	{
		try
		{
			return element.ValueKind switch
			{
				JsonValueKind.String when typeof(T) == typeof(string) => (T)(object)(element.GetString() ?? throw new ValidationException($"{fieldName} cannot be null")),
				JsonValueKind.Number when typeof(T) == typeof(int) => (T)(object)element.GetInt32(),
				JsonValueKind.Number when typeof(T) == typeof(long) => (T)(object)element.GetInt64(),
				JsonValueKind.Number when typeof(T) == typeof(double) => (T)(object)element.GetDouble(),
				JsonValueKind.Number when typeof(T) == typeof(decimal) => (T)(object)element.GetDecimal(),
				JsonValueKind.True when typeof(T) == typeof(bool) => (T)(object)true,
				JsonValueKind.False when typeof(T) == typeof(bool) => (T)(object)false,
				_ => throw new ValidationException($"{fieldName} must be of type {typeof(T).Name}")
			};
		}
		catch (InvalidOperationException ex)
		{
			throw new ValidationException($"{fieldName} cannot be converted to {typeof(T).Name}: {ex.Message}");
		}
	}

	public static string GetValidatedString(this JsonElement element, [CallerArgumentExpression(nameof(element))] string fieldName = "")
	{
		return element.GetValidatedValue<string>(fieldName);
	}
}
