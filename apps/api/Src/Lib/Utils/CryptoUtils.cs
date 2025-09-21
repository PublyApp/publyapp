namespace MainApi.Src.Lib.Utils;

using System.Security.Cryptography;
using System.Text;


public static class CryptoUtils {
	private static ReadOnlySpan<char> Chars => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

	/// <summary>
	/// Generates a random alphanumeric string of specified size.
	/// Equivalent to Parse Server's randomString function.
	/// </summary>
	/// <param name="size">The length of the string to generate</param>
	/// <returns>A random alphanumeric string</returns>
	/// <exception cref="ArgumentException">Thrown when size is 0</exception>
	public static string RandomString(int size) {
		if (size == 0) {
			throw new ArgumentException("Zero-length randomString is useless.", nameof(size));
		}

		// Use stackalloc for small sizes, heap allocation for larger ones
		Span<byte> bytes = size <= 256 ? stackalloc byte[size] : new byte[size];
		RandomNumberGenerator.Fill(bytes);

		// Use string.Create to avoid intermediate char array allocation
		return string.Create(size, bytes, static (chars, randomBytes) => {
			var charsSpan = Chars;
			for (int i = 0; i < chars.Length; i++) {
				chars[i] = charsSpan[randomBytes[i] % charsSpan.Length];
			}
		});
	}

	/// <summary>
	/// Returns a new random hex string suitable for secure tokens.
	/// Equivalent to Parse Server's newToken function.
	/// </summary>
	/// <param name="size">The length of the hex string (default: 32)</param>
	/// <returns>A random hex string suitable for secure tokens</returns>
	public static string NewToken(int size = 32) {
		var byteLength = size / 2; // Each byte produces 2 hex characters

		// Use stackalloc for small sizes (typical tokens), heap allocation for larger ones
		Span<byte> bytes = byteLength <= 128 ? stackalloc byte[byteLength] : new byte[byteLength];
		RandomNumberGenerator.Fill(bytes);

		return Convert.ToHexString(bytes).ToLower();
	}

	// Secret key for string encoding - should be at least 32 bytes
	// This matches the default secret from the TypeScript implementation
	private const string STRING_ENCRYPTION_SECRET_DEFAULT = "kkV4WINee3ZuveFJkBTwja5jhQ6dJ1gtbutuhp1Ncjg=";

	/// <summary>
	/// Encodes a string using AES-256-GCM encryption
	/// </summary>
	/// <param name="input">The string to encode</param>
	/// <param name="secret">The base64-encoded secret key (optional, uses default if not provided)</param>
	/// <returns>The encoded string as a URL-safe base64 string</returns>
	/// <exception cref="ArgumentException">Thrown when input is null or empty</exception>
	/// <exception cref="CryptographicException">Thrown when encryption fails</exception>
	public static string EncryptString(string input, string? secret = null) {
		if (string.IsNullOrEmpty(input)) {
			throw new ArgumentException("Input string cannot be null or empty", nameof(input));
		}

		try {
			secret ??= STRING_ENCRYPTION_SECRET_DEFAULT;

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
		} catch (Exception ex) when (ex is not ArgumentException) {
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
	public static string DecryptString(string encodedInput, string? secret = null) {
		if (string.IsNullOrEmpty(encodedInput)) {
			throw new ArgumentException("Encoded input string cannot be null or empty", nameof(encodedInput));
		}

		try {
			secret ??= STRING_ENCRYPTION_SECRET_DEFAULT;

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
		} catch (Exception ex) when (ex is not ArgumentException) {
			throw new CryptographicException($"Failed to decode string: {ex.Message}", ex);
		}
	}

	/// <summary>
	/// Validates if a string is a valid encoded string
	/// </summary>
	/// <param name="encodedInput">The string to validate</param>
	/// <param name="secret">The base64-encoded secret key (optional, uses default if not provided)</param>
	/// <returns>True if it's a valid encoded string, false otherwise</returns>
	public static bool IsValidEncryptedString(string encodedInput, string? secret = null) {
		try {
			DecryptString(encodedInput, secret);
			return true;
		} catch {
			return false;
		}
	}

	/// <summary>
	/// Generates a new random secret key for string encoding
	/// </summary>
	/// <returns>A base64-encoded 32-byte secret key</returns>
	public static string GenerateSecretKey() {
		using var rng = RandomNumberGenerator.Create();
		var keyBytes = new byte[32]; // 256 bits
		rng.GetBytes(keyBytes);
		return Convert.ToBase64String(keyBytes);
	}
}
