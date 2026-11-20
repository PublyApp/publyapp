using System.Text;

using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Fakes;

/// <summary>
/// E2E seam: reversible, NOT secure, purpose-bound encoding in place of Data Protection.
/// The e2e stack boots with an empty key ring that already holds the master-key canary
/// row, and Data Protection cannot create its first key beside it, so a real
/// <see cref="CredentialProtector"/> answers 500 there. Registered ONLY when
/// PUBLISHING_FAKE_PROVIDER=1 on a Development/Testing host, like every other fake.
/// </summary>
public sealed class FakeCredentialProtector : ICredentialProtector {
	public string Protect(string plaintext, SocialProvider provider) {
		return this.Protect(plaintext, provider.ToString());
	}

	public string Protect(string plaintext, string purpose) {
		return Convert.ToBase64String(Encoding.UTF8.GetBytes($"{purpose}:{plaintext}"));
	}

	public UnprotectResult Unprotect(string? protectedText, SocialProvider provider) {
		return this.Unprotect(protectedText, provider.ToString());
	}

	public UnprotectResult Unprotect(string? protectedText, string purpose) {
		if (string.IsNullOrEmpty(protectedText)) {
			return UnprotectResult.Absent();
		}

		try {
			var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(protectedText));
			var prefix = $"{purpose}:";
			return decoded.StartsWith(prefix, StringComparison.Ordinal)
				? UnprotectResult.Ok(decoded[prefix.Length..])
				: UnprotectResult.Tampered();
		} catch (FormatException) {
			return UnprotectResult.Tampered();
		}
	}
}
