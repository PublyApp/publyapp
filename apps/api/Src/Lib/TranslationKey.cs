using System.Text.Json;
using System.Text.Json.Serialization;

namespace MainApi.Src.Lib;

/// <summary>
/// Represents a type-safe translation key that can only be created from generated constants
/// </summary>
[JsonConverter(typeof(TranslationKeyJsonConverter))]
public readonly struct TranslationKey : IEquatable<TranslationKey> {
	/// <summary>
	/// The translation key value (e.g., "unauthorized", "not-found")
	/// </summary>
	public string Value { get; }

	/// <summary>
	/// Creates a new TranslationKey with the specified value
	/// </summary>
	/// <param name="value">The translation key value</param>
	public TranslationKey(string value) {
		ArgumentNullException.ThrowIfNull(value);
		Value = value;
	}

	/// <summary>
	/// Returns the translation key value
	/// </summary>
	public override string ToString() => Value;

	/// <summary>
	/// Implicitly converts a TranslationKey to its string value
	/// </summary>
	public static implicit operator string(TranslationKey key) => key.Value;

	/// <summary>
	/// Checks equality with another TranslationKey
	/// </summary>
	public bool Equals(TranslationKey other) => Value == other.Value;

	/// <summary>
	/// Checks equality with an object
	/// </summary>
	public override bool Equals(object? obj) => obj is TranslationKey other && Equals(other);

	/// <summary>
	/// Gets the hash code for this TranslationKey
	/// </summary>
	public override int GetHashCode() => Value.GetHashCode();

	/// <summary>
	/// Equality operator
	/// </summary>
	public static bool operator ==(TranslationKey left, TranslationKey right) => left.Equals(right);

	/// <summary>
	/// Inequality operator
	/// </summary>
	public static bool operator !=(TranslationKey left, TranslationKey right) => !left.Equals(right);
}

/// <summary>
/// JSON converter for TranslationKey that serializes it as a simple string
/// </summary>
public class TranslationKeyJsonConverter : JsonConverter<TranslationKey> {
	public override TranslationKey Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) {
		return new TranslationKey(reader.GetString() ?? string.Empty);
	}

	public override void Write(Utf8JsonWriter writer, TranslationKey value, JsonSerializerOptions options) {
		writer.WriteStringValue(value.Value);
	}
}
