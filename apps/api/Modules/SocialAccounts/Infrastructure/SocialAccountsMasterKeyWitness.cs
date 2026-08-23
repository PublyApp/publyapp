using System.Security.Cryptography;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// Startup witness: proves SOCIAL_ACCOUNTS_MASTER_KEY actually WORKS, not merely that
/// it parses as a 32-byte AES-256-GCM key (review r3 MAJOR).
/// <para>
/// A pure encrypt/decrypt round-trip with the same in-memory key always succeeds for any
/// well-sized value, so it could never detect a wrong-value key or an api/worker key
/// divergence. Instead the witness maintains a CANARY: a known sentinel encrypted under
/// the master key at first boot and persisted via <see cref="IKeyRingCanaryStore"/>
/// beside the Data Protection key ring. Every boot decrypts the persisted canary; a key
/// with the right size but the wrong value fails authentication and the process refuses
/// to start with a plain-words cause (Epic C §4, transparent failure causes).
/// </para>
/// </summary>
public static class SocialAccountsMasterKeyWitness {
	private static readonly byte[] Sentinel =
		System.Text.Encoding.UTF8.GetBytes("__social_accounts_master_key_sentinel__");

	public static void EnsureMasterKeyUsable(byte[] key, IKeyRingCanaryStore? canaryStore = null) {
		if (key.Length == 0) {
			throw new InvalidOperationException(
				"SOCIAL_ACCOUNTS_MASTER_KEY is missing or empty: "
					+ "the API/worker will not start without a valid 32-byte key. "
					+ "Generate one with: openssl rand -base64 32"
			);
		}

		if (key.Length != 32) {
			throw new InvalidOperationException(
				"SOCIAL_ACCOUNTS_MASTER_KEY has the wrong size "
					+ $"({key.Length} bytes; AES-256-GCM needs exactly 32): "
					+ "the API/worker will not start. "
					+ "Generate one with: openssl rand -base64 32"
			);
		}

		if (canaryStore is null) {
			// No persistence seam available (e.g. build-time OpenAPI generation with no
			// database): only the parse/size contract above is verifiable here. Callers
			// that serve real traffic MUST pass a store so the canary check runs.
			return;
		}

		try {
			var stored = canaryStore.Read();
			if (string.IsNullOrEmpty(stored)) {
				// First boot (or canary lost): mint it under the current key. From now on
				// every boot with a different key value fails below.
				canaryStore.Write(ProtectSentinel(key));
				return;
			}

			VerifyPersistedCanary(key, stored);
		} catch (Exception ex) when (ex is CryptographicException or FormatException or ArgumentException) {
			throw WrongKey(ex);
		}
	}

	private static void VerifyPersistedCanary(byte[] key, string storedBlob) {
		var parts = storedBlob.Split(':');
		if (parts.Length != 3) {
			throw new FormatException("Malformed master-key canary blob.");
		}
		var nonce = Convert.FromBase64String(parts[0]);
		var ciphertext = Convert.FromBase64String(parts[1]);
		var tag = Convert.FromBase64String(parts[2]);

		using var aes = new AesGcm(key, tag.Length);
		var decrypted = new byte[ciphertext.Length];
		aes.Decrypt(nonce, ciphertext, tag, decrypted);

		if (!decrypted.AsSpan().SequenceEqual(Sentinel)) {
			throw new CryptographicException("Canary decrypted to an unexpected value.");
		}
	}

	private static string ProtectSentinel(byte[] key) {
		var nonce = new byte[AesGcm.NonceByteSizes.MaxSize]; // 12 bytes
		RandomNumberGenerator.Fill(nonce);
		var ciphertext = new byte[Sentinel.Length];
		var tag = new byte[AesGcm.TagByteSizes.MaxSize];

		using var aes = new AesGcm(key, AesGcm.TagByteSizes.MaxSize);
		aes.Encrypt(nonce, Sentinel, ciphertext, tag);

		return string.Create(
			System.Globalization.CultureInfo.InvariantCulture,
			$"{Convert.ToBase64String(nonce)}:{Convert.ToBase64String(ciphertext)}:{Convert.ToBase64String(tag)}"
		);
	}

	private static InvalidOperationException WrongKey(Exception cause) {
		return new InvalidOperationException(
			"SOCIAL_ACCOUNTS_MASTER_KEY does not match the master-key canary stored beside "
				+ "the Data Protection key ring: credentials were encrypted under a DIFFERENT "
				+ "key, so this process would silently fail to decrypt them. The API/worker "
				+ "will not start. Restore the original SOCIAL_ACCOUNTS_MASTER_KEY value for "
				+ "ALL services (api, worker, migrate), or deliberately rotate: export the old "
				+ "key, re-protect stored credentials, delete the stale canary row "
				+ "(" + PostgresKeyRingCanaryStore.RowName + ") and reboot.",
			cause
		);
	}
}
