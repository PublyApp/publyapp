using Microsoft.AspNetCore.DataProtection;

using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

public sealed class CredentialProtector : ICredentialProtector {
	private readonly IDataProtectionProvider _dataProtectionProvider;

	public CredentialProtector(IDataProtectionProvider dataProtectionProvider) {
		_dataProtectionProvider = dataProtectionProvider;
	}

	public string Protect(string plaintext, SocialProvider provider) {
		return _dataProtectionProvider
			.CreateProtector($"social-account-{provider.ToString().ToLowerInvariant()}-v1")
			.Protect(plaintext);
	}

	public string? Unprotect(string? protectedText, SocialProvider provider) {
		if (string.IsNullOrEmpty(protectedText)) {
			return null;
		}
		try {
			return _dataProtectionProvider
				.CreateProtector($"social-account-{provider.ToString().ToLowerInvariant()}-v1")
				.Unprotect(protectedText);
		} catch (System.Security.Cryptography.CryptographicException) {
			return null;
		}
	}
}
