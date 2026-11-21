using System.Security.Cryptography;

using Microsoft.AspNetCore.Cryptography.KeyDerivation;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// Builds a hash in the format used before #2468: base64(salt).base64(hash),
/// PBKDF2-HMAC-SHA256 at 100,000 iterations.
/// </summary>
internal static class LegacyPasswordHash {
	public static string Create(string password) {
		var salt = RandomNumberGenerator.GetBytes(16);
		var key = KeyDerivation.Pbkdf2(
			password,
			salt,
			KeyDerivationPrf.HMACSHA256,
			100_000,
			32
		);
		return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
	}
}
