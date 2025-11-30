using System.Security.Cryptography;
using Microsoft.AspNetCore.Cryptography.KeyDerivation;

namespace MainApi.Src.Modules.Shared.Auth;

public static class PasswordUtils {
	public static string HashPassword(string password) {
		// Generate a 128-bit salt using a cryptographically strong random sequence of nonzero values
		byte[] salt = new byte[128 / 8];
		RandomNumberGenerator.Fill(salt);

		// Derive a 256-bit subkey (use HMACSHA256 with 100,000 iterations)
		string hashed = Convert.ToBase64String(KeyDerivation.Pbkdf2(
				password: password,
				salt: salt,
				prf: KeyDerivationPrf.HMACSHA256,
				iterationCount: 100000,
				numBytesRequested: 256 / 8));

		// Return the salt and hash concatenated
		return $"{Convert.ToBase64String(salt)}.{hashed}";
	}

	public static bool VerifyPassword(string password, string hashedPassword) {
		try {
			// Split the stored password into salt and hash
			var parts = hashedPassword.Split('.');
			if (parts.Length != 2) {
				return false;
			}

			var salt = Convert.FromBase64String(parts[0]);
			var hash = parts[1];

			// Derive the hash from the provided password and stored salt
			string hashedInput = Convert.ToBase64String(KeyDerivation.Pbkdf2(
					password: password,
					salt: salt,
					prf: KeyDerivationPrf.HMACSHA256,
					iterationCount: 100000,
					numBytesRequested: 256 / 8));

			// Compare the computed hash with the stored hash
			return hash == hashedInput;
		} catch {
			return false;
		}
	}
}
