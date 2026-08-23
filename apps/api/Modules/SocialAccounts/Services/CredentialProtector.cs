using Microsoft.AspNetCore.DataProtection;

using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

public sealed class CredentialProtector : ICredentialProtector {
	private readonly IDataProtectionProvider _dataProtectionProvider;

	public CredentialProtector(IDataProtectionProvider dataProtectionProvider) {
		_dataProtectionProvider = dataProtectionProvider;
	}

	public string Protect(string plaintext, SocialProvider provider) {
		return ProtectorFor(provider).Protect(plaintext);
	}

	public UnprotectResult Unprotect(string? protectedText, SocialProvider provider) {
		if (string.IsNullOrEmpty(protectedText)) {
			return UnprotectResult.Absent();
		}
		try {
			return UnprotectResult.Ok(ProtectorFor(provider).Unprotect(protectedText));
		} catch (System.Security.Cryptography.CryptographicException) {
			// GCM authentication failed: the payload was corrupted/truncated OR was
			// protected under another purpose/key. Either way the caller must see a
			// distinct outcome — never a null conflated with "nothing stored" (review r3,
			// transparent-failure-causes rule).
			return UnprotectResult.Tampered();
		}
	}

	private IDataProtector ProtectorFor(SocialProvider provider) {
		return _dataProtectionProvider.CreateProtector(
			$"social-account-{provider.ToString().ToLowerInvariant()}-v1"
		);
	}
}
