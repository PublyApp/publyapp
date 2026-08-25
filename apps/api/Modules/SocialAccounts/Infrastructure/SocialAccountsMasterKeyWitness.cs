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

	// The committed all-zero base64 string shared by apps/api/Dockerfile (both build-time
	// Production blocks), quality-gate.yml, the just recipes and the front-e2e history:
	// the repo's DOCUMENTED, publicly known build placeholder. Kept byte-exact in sync
	// with AppEnvironmentBuildEnvCompletenessSpec.PlaceholderMasterKey.
	private static readonly byte[] DocumentedBuildPlaceholder =
		Convert.FromBase64String("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");

	/// <summary>
	/// Exact text of the Information line logged when the canary round-trip PASSES at real
	/// boot (#1284). Public so the boot-log spec asserts against the same constant Program
	/// writes, instead of a copy that could drift.
	/// </summary>
	public const string CanaryPassedLogLine =
		"Social accounts master-key canary PASSED: SOCIAL_ACCOUNTS_MASTER_KEY decrypts the "
		+ "persisted key-ring canary; credential protection is verified for this process.";

	/// <summary>
	/// The fail-loud gate: throws (refuses boot) when the key is missing, wrong-sized, or
	/// does not decrypt the persisted canary — that path is unchanged (#1284). When the
	/// canary round-trip PASSES, one structured Information line goes to
	/// <paramref name="logger"/> so operators can tell "verified" boots from doc-gen runs
	/// where only the parse contract ran.
	/// </summary>
	public static void EnsureMasterKeyUsable(
		byte[] key,
		IKeyRingCanaryStore? canaryStore = null,
		ILogger? logger = null
	) {
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
			// that serve real traffic MUST pass a store so the canary check runs. No pass
			// line is logged here — nothing was verified beyond key SIZE (#1284). The
			// known-non-secret rejection below deliberately lives AFTER this return: the
			// doc-gen process legitimately boots with the committed build placeholder,
			// and tightening THIS path would break `just build-api`.
			return;
		}

		// Real boot (api/worker serving real traffic, or the e2e containers): refuse the
		// publicly known placeholder and degenerate low-entropy values BEFORE the canary
		// round-trip. An operator pasting the placeholder into Dokploy would otherwise run
		// the whole deployment under a key anyone can read off the repository (#1294).
		RejectKnownNonSecretOrDegenerateValue(key);

		try {
			var stored = canaryStore.Read();
			if (string.IsNullOrEmpty(stored)) {
				// First boot (or canary lost): mint it under the current key. From now on
				// every boot with a different key value fails below.
				canaryStore.Write(ProtectSentinel(key));

				// #1416: re-read what is ACTUALLY stored before declaring victory.
				// Concurrent first boots all mint at once; with the unique partial index,
				// exactly ONE insert survives and the losers' writes are refused (23505).
				// Verifying the re-read blob under THIS key folds both outcomes into one
				// path: our own blob verifies trivially when we won the race, and the
				// winner's blob verifies too when every service shares the same key value
				// (the deployment contract) — while a divergent api/worker key now FAILS
				// here instead of being masked by an overwrite.
				stored = canaryStore.Read();

				if (string.IsNullOrEmpty(stored)) {
					throw new InvalidOperationException(
						"The master-key canary row (" + PostgresKeyRingCanaryStore.RowName
							+ " in data_protection_keys) is missing immediately after minting it: "
							+ "another process removed or replaced it mid-boot. Restart this "
							+ "service; if it recurs, verify every service (api, worker, migrate) "
							+ "uses the SAME SOCIAL_ACCOUNTS_MASTER_KEY value."
					);
				}
			}

			VerifyPersistedCanary(key, stored);
			logger?.LogInformation(CanaryPassedLogLine);
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

	// ---- #1294: publicly known placeholder + degenerate values refuse a REAL boot --

	// Entropy floor justification (issue #1294): an AES-256 master key needs only to be
	// unguessable. A 32-byte value with fewer than 16 DISTINCT byte values cannot plausibly
	// be that: honestly generated keys (openssl rand -base64 32) draw their bytes uniformly
	// and land below 16 distinct values with probability < 10^-15, while hand-copied
	// patterns (repeated words, padded constants, keyboard walks) sit far below the floor.
	// The floor therefore rejects degenerate operator input at a REAL boot with a false
	// positive rate that is negligible, and the all-same-byte family (any single value
	// repeated 32 times, not just the all-zero placeholder) fails both checks explicitly.
	private const int MinimumDistinctBytes = 16;

	private static void RejectKnownNonSecretOrDegenerateValue(byte[] key) {
		string? reason = null;

		if (key.AsSpan().SequenceEqual(DocumentedBuildPlaceholder)) {
			reason = "it is the repository's publicly documented build placeholder";
		} else {
			var distinct = DistinctByteCount(key);
			if (distinct == 1) {
				reason = "all 32 of its bytes are the same value";
			} else if (distinct < MinimumDistinctBytes) {
				reason = $"it carries only {distinct} distinct byte values across its "
					+ $"32 bytes (fewer than {MinimumDistinctBytes})";
			}
		}

		if (reason is null) {
			return;
		}

		throw new InvalidOperationException(
			"SOCIAL_ACCOUNTS_MASTER_KEY was rejected because " + reason + ". Anyone who can "
				+ "read this repository — or reproduce a simple repeated pattern — could decrypt "
				+ "every stored social-account credential, so the API/worker will not start with "
				+ "this value. Generate a real key with: openssl rand -base64 32"
		);
	}

	private static int DistinctByteCount(byte[] key) {
		var seen = new bool[256];
		var count = 0;
		foreach (var b in key) {
			if (!seen[b]) {
				seen[b] = true;
				count++;
			}
		}

		return count;
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
