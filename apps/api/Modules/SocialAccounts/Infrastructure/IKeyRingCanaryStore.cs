namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// Persistence seam for the master-key boot canary (review r3): a known ciphertext
/// protected under SOCIAL_ACCOUNTS_MASTER_KEY, stored beside the key ring. The witness
/// reads it at boot; a key with the right SIZE but wrong VALUE fails to decrypt it and
/// the process refuses to start. The production store is
/// <see cref="PostgresKeyRingCanaryStore"/>; tests substitute an in-memory fake.
/// </summary>
public interface IKeyRingCanaryStore {
	/// <summary>Returns the stored canary blob, or null when none exists yet.</summary>
	string? Read();

	/// <summary>Creates or updates the canary blob.</summary>
	void Write(string blob);
}
