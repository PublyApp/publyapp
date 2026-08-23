using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

public interface ICredentialProtector {
	// purpose is per-provider so a Bluesky key cannot decrypt an OAuth-stored secret.
	string Protect(string plaintext, SocialProvider provider);

	/// <summary>
	/// Typed unprotect (review r3): never swallows the cryptographic failure into a
	/// null that conflates "nothing stored" with "cannot decrypt". Tampered covers both
	/// corrupted payloads and cross-purpose blobs (GCM auth failure either way).
	/// </summary>
	UnprotectResult Unprotect(string? protectedText, SocialProvider provider);
}
