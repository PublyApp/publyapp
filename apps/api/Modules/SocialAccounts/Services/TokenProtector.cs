using Microsoft.AspNetCore.DataProtection;

using PublyApp.Api.Lib.DI;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Data Protection-backed <see cref="ITokenProtector"/>. Each purpose string maps to
/// its own Data Protection purpose, so payloads are domain-isolated and tamper-evident
/// (authenticated encryption: any modification fails <see cref="IDataProtector.Unprotect"/>).
/// </summary>
[Service(ServiceLifetime.Singleton)]
public sealed class TokenProtector : ITokenProtector {
	// Shared provider root; per-purpose protectors are cached because
	// IDataProtectionProvider.CreateProtector allocates a chain each call.
	private readonly IDataProtectionProvider _provider;
	private readonly Lock _protectorsLock = new();
	private readonly Dictionary<string, IDataProtector> _protectors =
		new(StringComparer.Ordinal);

	public TokenProtector(IDataProtectionProvider provider) {
		_provider = provider;
	}

	public string Protect(string purpose, string plaintext) {
		return GetProtector(purpose).Protect(plaintext);
	}

	public string Unprotect(string purpose, string protectedPayload) {
		return GetProtector(purpose).Unprotect(protectedPayload);
	}

	private IDataProtector GetProtector(string purpose) {
		if (string.IsNullOrWhiteSpace(purpose)) {
			throw new ArgumentException("Purpose must be a non-empty stable identifier.", nameof(purpose));
		}

		lock (_protectorsLock) {
			if (_protectors.TryGetValue(purpose, out var existing)) {
				return existing;
			}

			var created = _provider.CreateProtector($"PublyApp.SocialAccounts.{purpose}");
			_protectors[purpose] = created;
			return created;
		}
	}
}
