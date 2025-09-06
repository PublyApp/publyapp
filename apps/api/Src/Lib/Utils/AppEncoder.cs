namespace MainApi.Src.Lib.Utils;

using System.Security.Cryptography;
using System.Text;

/// <summary>
/// Utility class for encoding and decoding strings using AES-256-GCM encryption.
/// Provides functionality equivalent to the TypeScript string encoding utilities.
/// </summary>
public static class AppEncoder
{
	// Secret key for string encoding - should be at least 32 bytes
	// This matches the default secret from the TypeScript implementation
	private const string STRING_ENCODING_SECRET_DEFAULT = "kkV4WINee3ZuveFJkBTwja5jhQ6dJ1gtbutuhp1Ncjg=";

	/// <summary>
	/// Encodes a string using AES-256-GCM encryption
	/// </summary>
	/// <param name="input">The string to encode</param>
	/// <param name="secret">The base64-encoded secret key (optional, uses default if not provided)</param>
	/// <returns>The encoded string as a URL-safe base64 string</returns>
	/// <exception cref="ArgumentException">Thrown when input is null or empty</exception>
	/// <exception cref="CryptographicException">Thrown when encryption fails</exception>
	public static string EncodeString(string input, string? secret = null)
	{
		if (string.IsNullOrEmpty(input))
		{
			throw new ArgumentException("Input string cannot be null or empty", nameof(input));
		}

		try
		{
			secret ??= STRING_ENCODING_SECRET_DEFAULT;

			// Generate a random IV (Initialization Vector) - 12 bytes for AES-GCM
			var iv = new byte[12];
			RandomNumberGenerator.Fill(iv);

			var key = Convert.FromBase64String(secret);
			var inputBytes = Encoding.UTF8.GetBytes(input);

			// Create the cipherText and tag arrays
			var cipherText = new byte[inputBytes.Length];
			var tag = new byte[16]; // 128-bit authentication tag

			// Encrypt using AES-GCM
			using var aesGcm = new AesGcm(key, tag.Length);
			aesGcm.Encrypt(iv, inputBytes, cipherText, tag);

			// Combine IV, encrypted data, and auth tag
			var combined = new byte[iv.Length + cipherText.Length + tag.Length];
			Array.Copy(iv, 0, combined, 0, iv.Length);
			Array.Copy(cipherText, 0, combined, iv.Length, cipherText.Length);
			Array.Copy(tag, 0, combined, iv.Length + cipherText.Length, tag.Length);

			// Return as URL-safe base64
			return Convert.ToBase64String(combined)
				.Replace('+', '-')
				.Replace('/', '_')
				.TrimEnd('=');
		}
		catch (Exception ex) when (ex is not ArgumentException)
		{
			throw new CryptographicException($"Failed to encode string: {ex.Message}", ex);
		}
	}

	/// <summary>
	/// Decodes an encoded string
	/// </summary>
	/// <param name="encodedInput">The encoded string as a URL-safe base64 string</param>
	/// <param name="secret">The base64-encoded secret key (optional, uses default if not provided)</param>
	/// <returns>The decoded string</returns>
	/// <exception cref="ArgumentException">Thrown when encodedInput is null or empty</exception>
	/// <exception cref="CryptographicException">Thrown when decryption fails</exception>
	public static string DecodeString(string encodedInput, string? secret = null)
	{
		if (string.IsNullOrEmpty(encodedInput))
		{
			throw new ArgumentException("Encoded input string cannot be null or empty", nameof(encodedInput));
		}

		try
		{
			secret ??= STRING_ENCODING_SECRET_DEFAULT;

			// Convert from URL-safe base64 back to regular base64
			var base64 = encodedInput
				.Replace('-', '+')
				.Replace('_', '/');

			// Add padding back
			var padding = (4 - (base64.Length % 4)) % 4;
			base64 += new string('=', padding);

			var combined = Convert.FromBase64String(base64);

			// Extract IV (first 12 bytes for AES-GCM)
			var iv = new byte[12];
			Array.Copy(combined, 0, iv, 0, 12);

			// Extract auth tag (last 16 bytes)
			var authTag = new byte[16];
			Array.Copy(combined, combined.Length - 16, authTag, 0, 16);

			// Extract encrypted data (everything in between)
			var encryptedData = new byte[combined.Length - 28]; // 12 for IV + 16 for auth tag
			Array.Copy(combined, 12, encryptedData, 0, encryptedData.Length);

			// Create decipher
			var key = Convert.FromBase64String(secret);
			var plaintext = new byte[encryptedData.Length];

			using var aesGcm = new AesGcm(key, authTag.Length);
			aesGcm.Decrypt(iv, encryptedData, authTag, plaintext);

			return Encoding.UTF8.GetString(plaintext);
		}
		catch (Exception ex) when (ex is not ArgumentException)
		{
			throw new CryptographicException($"Failed to decode string: {ex.Message}", ex);
		}
	}

	/// <summary>
	/// Validates if a string is a valid encoded string
	/// </summary>
	/// <param name="encodedInput">The string to validate</param>
	/// <param name="secret">The base64-encoded secret key (optional, uses default if not provided)</param>
	/// <returns>True if it's a valid encoded string, false otherwise</returns>
	public static bool IsValidEncodedString(string encodedInput, string? secret = null)
	{
		try
		{
			DecodeString(encodedInput, secret);
			return true;
		}
		catch
		{
			return false;
		}
	}

	/// <summary>
	/// Generates a new random secret key for string encoding
	/// </summary>
	/// <returns>A base64-encoded 32-byte secret key</returns>
	public static string GenerateSecretKey()
	{
		using var rng = RandomNumberGenerator.Create();
		var keyBytes = new byte[32]; // 256 bits
		rng.GetBytes(keyBytes);
		return Convert.ToBase64String(keyBytes);
	}
}
