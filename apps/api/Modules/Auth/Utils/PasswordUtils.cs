using System.Globalization;
using System.Security.Cryptography;

using Microsoft.AspNetCore.Cryptography.KeyDerivation;

using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.Auth.Utils;

/// <summary>
/// Outcome of a password check. <see cref="NeedsRehash"/> is only ever true
/// when <see cref="Matches"/> is true: the stored hash is valid but uses an
/// older format or a lower cost than the current policy.
/// </summary>
public readonly record struct PasswordVerification(bool Matches, bool NeedsRehash);

public static class PasswordUtils {
	// PBKDF2-HMAC-SHA256 work factor (OWASP password storage cheat sheet).
	public const int ProductionIterations = 600_000;

	// Hashes written before the versioned format were `salt.hash` at this cost.
	public const int LegacyIterations = 100_000;

	// Lower cost used ONLY when the host environment is Testing, so specs that
	// create many users stay fast. Not configurable: it is not read from any
	// config source, and every other environment (Development included, and an
	// unset one) resolves to ProductionIterations.
	internal const int ReducedIterations = 1_000;

	// A stored hash claiming more iterations than this is treated as invalid,
	// so a planted huge count cannot pin the CPU.
	internal const int MaxIterations = 10_000_000;

	private const string _VersionPrefix = "v2";
	private const int _SaltBytes = 128 / 8;
	private const int _KeyBytes = 256 / 8;

	internal static int IterationsForEnvironment(string? hostEnvironmentName) {
		var reduced = string.Equals(
			hostEnvironmentName,
			EnvironmentNames.Testing,
			StringComparison.OrdinalIgnoreCase
		);
		return reduced ? PasswordUtils.ReducedIterations : PasswordUtils.ProductionIterations;
	}

	// Hash cost in effect for this process.
	internal static int CurrentIterations {
		get {
			return PasswordUtils.IterationsForEnvironment(AppEnvironment.EnvironmentName);
		}
	}

	public static string HashPassword(string password) {
		return PasswordUtils.HashPassword(password, PasswordUtils.CurrentIterations);
	}

	internal static string HashPassword(string password, int iterations) {
		byte[] salt = RandomNumberGenerator.GetBytes(PasswordUtils._SaltBytes);
		var key = PasswordUtils._Derive(password, salt, iterations);

		// v2.<iterations>.<salt>.<hash>
		return $"{PasswordUtils._VersionPrefix}.{iterations.ToString(CultureInfo.InvariantCulture)}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
	}

	public static PasswordVerification VerifyPassword(string password, string hashedPassword) {
		return PasswordUtils.VerifyPassword(
			password,
			hashedPassword,
			PasswordUtils.CurrentIterations,
			onDerive: null
		);
	}

	// `currentIterations` is the cost policy; `onDerive` observes the iteration
	// count of every PBKDF2 run (tests assert the total work done).
	internal static PasswordVerification VerifyPassword(
		string password,
		string hashedPassword,
		int currentIterations,
		Action<int>? onDerive
	) {
		try {
			if (!PasswordUtils._TryParse(hashedPassword, out var iterations, out var salt, out var expected)) {
				return new PasswordVerification(false, false);
			}

			onDerive?.Invoke(iterations);
			var actual = PasswordUtils._Derive(password, salt, iterations);
			if (!CryptographicOperations.FixedTimeEquals(actual, expected)) {
				// A failure must cost the current price whatever the stored
				// cost, so response time cannot tell an old-cost account from an
				// unknown email (which verifies against a current-cost dummy).
				if (iterations < currentIterations) {
					var missing = currentIterations - iterations;
					onDerive?.Invoke(missing);
					_ = PasswordUtils._Derive(password, salt, missing);
				}

				return new PasswordVerification(false, false);
			}

			var isCurrent =
				hashedPassword.StartsWith(PasswordUtils._VersionPrefix + ".", StringComparison.Ordinal)
				&& iterations >= currentIterations;
			return new PasswordVerification(true, !isCurrent);
		} catch {
			return new PasswordVerification(false, false);
		}
	}

	private static bool _TryParse(
		string stored,
		out int iterations,
		out byte[] salt,
		out byte[] hash
	) {
		iterations = PasswordUtils.LegacyIterations;
		salt = [];
		hash = [];

		var parts = stored.Split('.');
		if (parts.Length == 2) {
			salt = Convert.FromBase64String(parts[0]);
			hash = Convert.FromBase64String(parts[1]);
			return true;
		}

		if (
			parts.Length != 4
			|| parts[0] != PasswordUtils._VersionPrefix
			|| !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out iterations)
			|| iterations <= 0
			|| iterations > PasswordUtils.MaxIterations
		) {
			return false;
		}

		salt = Convert.FromBase64String(parts[2]);
		hash = Convert.FromBase64String(parts[3]);
		return true;
	}

	private static byte[] _Derive(string password, byte[] salt, int iterations) {
		return KeyDerivation.Pbkdf2(
			password: password,
			salt: salt,
			prf: KeyDerivationPrf.HMACSHA256,
			iterationCount: iterations,
			numBytesRequested: PasswordUtils._KeyBytes
		);
	}
}
