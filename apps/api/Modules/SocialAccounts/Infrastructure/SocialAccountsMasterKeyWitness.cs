using System.Security.Cryptography;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// Startup witness: proves SOCIAL_ACCOUNTS_MASTER_KEY is a valid 32-byte AES-256-GCM key
/// by performing a direct encrypt/decrypt round-trip of a sentinel value. Throws with a
/// clear message on any failure so the API/worker refuse to boot with a missing or wrong
/// master key (Epic C §4).
/// </summary>
public static class SocialAccountsMasterKeyWitness {
	private static readonly byte[] Sentinel =
		System.Text.Encoding.UTF8.GetBytes("__social_accounts_master_key_sentinel__");

	public static void EnsureMasterKeyUsable(byte[] key) {
		if (key.Length == 0) {
			throw new InvalidOperationException(
				"SOCIAL_ACCOUNTS_MASTER_KEY is missing or empty: "
					+ "the API/worker will not start without a valid 32-byte key. "
					+ "Generate one with: openssl rand -base64 32"
			);
		}

		try {
			var nonce = new byte[AesGcm.NonceByteSizes.MaxSize]; // 12 bytes
			RandomNumberGenerator.Fill(nonce);
			var ciphertext = new byte[Sentinel.Length];
			var tag = new byte[AesGcm.TagByteSizes.MaxSize];

			using (var aes = new AesGcm(key, AesGcm.TagByteSizes.MaxSize)) {
				aes.Encrypt(nonce, Sentinel, ciphertext, tag);
			}

			var decrypted = new byte[ciphertext.Length];
			using (var aes = new AesGcm(key, AesGcm.TagByteSizes.MaxSize)) {
				aes.Decrypt(nonce, ciphertext, tag, decrypted);
			}

			if (!decrypted.AsSpan().SequenceEqual(Sentinel)) {
				throw new InvalidOperationException(
					"Master key round-trip produced an unexpected value."
				);
			}
		} catch (InvalidOperationException) {
			// Re-throw our own InvalidOperationExceptions (from inner round-trip check)
			throw;
		} catch (Exception ex) {
			throw new InvalidOperationException(
				"SOCIAL_ACCOUNTS_MASTER_KEY is wrong: AES-256-GCM round-trip failed. "
					+ "The API/worker will not start. "
					+ "Generate a 32-byte key (openssl rand -base64 32) and set "
					+ "SOCIAL_ACCOUNTS_MASTER_KEY for api, worker, and migrate services.",
				ex
			);
		}
	}
}
