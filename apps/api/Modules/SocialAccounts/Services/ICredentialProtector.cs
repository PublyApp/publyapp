using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

public interface ICredentialProtector {
	// purpose is per-provider so a Bluesky key cannot decrypt an OAuth-stored secret.
	string Protect(string plaintext, SocialProvider provider);
	string? Unprotect(string? protectedText, SocialProvider provider);
}
