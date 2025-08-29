namespace MainApi.Src.Lib.Utils;

using System.Security.Cryptography;

public static class CryptoUtils
{
	private static ReadOnlySpan<char> Chars => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

	/// <summary>
	/// Generates a random alphanumeric string of specified size.
	/// Equivalent to Parse Server's randomString function.
	/// </summary>
	/// <param name="size">The length of the string to generate</param>
	/// <returns>A random alphanumeric string</returns>
	/// <exception cref="ArgumentException">Thrown when size is 0</exception>
	public static string RandomString(int size)
	{
		if (size == 0)
		{
			throw new ArgumentException("Zero-length randomString is useless.", nameof(size));
		}

		// Use stackalloc for small sizes, heap allocation for larger ones
		Span<byte> bytes = size <= 256 ? stackalloc byte[size] : new byte[size];
		RandomNumberGenerator.Fill(bytes);

		// Use string.Create to avoid intermediate char array allocation
		return string.Create(size, bytes, static (chars, randomBytes) =>
		{
			var charsSpan = Chars;
			for (int i = 0; i < chars.Length; i++)
			{
				chars[i] = charsSpan[randomBytes[i] % charsSpan.Length];
			}
		});
	}

	/// <summary>
	/// Returns a new random alphanumeric string suitable for object ID.
	/// Equivalent to Parse Server's newObjectId function.
	/// </summary>
	/// <param name="size">The length of the object ID (default: 10)</param>
	/// <returns>A random alphanumeric string suitable for object ID</returns>
	public static string NewObjectId(int size = 10)
	{
		return RandomString(size);
	}

	/// <summary>
	/// Returns a new random hex string suitable for secure tokens.
	/// Equivalent to Parse Server's newToken function.
	/// </summary>
	/// <param name="size">The length of the hex string (default: 32)</param>
	/// <returns>A random hex string suitable for secure tokens</returns>
	public static string NewToken(int size = 32)
	{
		var byteLength = size / 2; // Each byte produces 2 hex characters

		// Use stackalloc for small sizes (typical tokens), heap allocation for larger ones
		Span<byte> bytes = byteLength <= 128 ? stackalloc byte[byteLength] : new byte[byteLength];
		RandomNumberGenerator.Fill(bytes);

		return Convert.ToHexString(bytes).ToLower();
	}

	/// <summary>
	/// Generates MD5 hash of a string.
	/// Equivalent to Parse Server's md5Hash function.
	/// </summary>
	/// <param name="input">The string to hash</param>
	/// <returns>MD5 hash as hexadecimal string</returns>
	public static string Md5Hash(string input)
	{
		using var md5 = MD5.Create();

		// Calculate required byte length for UTF-8 encoding
		var maxByteCount = System.Text.Encoding.UTF8.GetMaxByteCount(input.Length);

		// Use stackalloc for small strings, heap allocation for larger ones
		Span<byte> inputBytes = maxByteCount <= 1024 ? stackalloc byte[maxByteCount] : new byte[maxByteCount];
		var actualByteCount = System.Text.Encoding.UTF8.GetBytes(input, inputBytes);

		// Use span for hash output to avoid intermediate allocation
		Span<byte> hashBytes = stackalloc byte[16]; // MD5 always produces 16 bytes
		md5.TryComputeHash(inputBytes[..actualByteCount], hashBytes, out _);

		return Convert.ToHexString(hashBytes).ToLower();
	}
}
