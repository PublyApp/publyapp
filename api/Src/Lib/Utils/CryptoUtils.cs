namespace MainApi.Src.Lib.Utils;

using System.Security.Cryptography;

public static class CryptoUtils
{
	private const string Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

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

		var bytes = new byte[size];
		RandomNumberGenerator.Fill(bytes);

		var objectId = new char[size];
		for (int i = 0; i < bytes.Length; ++i)
		{
			objectId[i] = Chars[bytes[i] % Chars.Length];
		}

		return new string(objectId);
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
		var bytes = new byte[size / 2]; // Each byte produces 2 hex characters
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
		var inputBytes = System.Text.Encoding.UTF8.GetBytes(input);
		var hashBytes = md5.ComputeHash(inputBytes);
		return Convert.ToHexString(hashBytes).ToLower();
	}
}
