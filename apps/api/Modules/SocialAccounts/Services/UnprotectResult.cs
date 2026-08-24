namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Typed outcome of <see cref="ICredentialProtector.Unprotect"/> (review r3): the
/// caller must be able to tell "no credential stored" apart from "the stored blob
/// cannot be decrypted under this protector's purpose". C2 needs that split to honour
/// the transparent-failure-causes rule: a tampered/wrong-purpose blob surfaces as a
/// NeedsReconnect state with a cause, never as a silent null.
/// </summary>
public enum UnprotectOutcome {
	/// <summary>Input was null/empty — no credential is stored.</summary>
	Absent = 0,
	/// <summary>The blob decrypted successfully; <see cref="UnprotectResult.Plaintext"/> carries the value.</summary>
	Ok = 1,
	/// <summary>Decryption failed authentication: the payload was tampered with, was
	/// truncated, or was protected under a different purpose/key.</summary>
	Tampered = 2,
}

/// <summary>Result of <see cref="ICredentialProtector.Unprotect"/>.</summary>
public readonly record struct UnprotectResult(UnprotectOutcome Outcome, string? Plaintext) {
	public static UnprotectResult Absent() {
		return new UnprotectResult(UnprotectOutcome.Absent, null);
	}

	public static UnprotectResult Ok(string plaintext) {
		return new UnprotectResult(UnprotectOutcome.Ok, plaintext);
	}

	public static UnprotectResult Tampered() {
		return new UnprotectResult(UnprotectOutcome.Tampered, null);
	}
}
