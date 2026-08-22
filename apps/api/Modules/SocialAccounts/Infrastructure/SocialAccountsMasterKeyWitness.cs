using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// Startup witness: proves SOCIAL_ACCOUNTS_MASTER_KEY can protect then unprotect a sentinel
/// through the persisted Postgres key ring. Throws with a clear message on any failure so the
/// API/worker refuse to boot with a missing or wrong master key (Epic C §4).
/// </summary>
public static class SocialAccountsMasterKeyWitness {
	private const string Sentinel = "__social_accounts_master_key_sentinel__";

	public static void EnsureMasterKeyUsable(IServiceProvider services) {
		var protector = services.GetRequiredService<ICredentialProtector>();
		try {
			var protectedValue = protector.Protect(Sentinel, SocialProvider.Bluesky);
			var roundTripped = protector.Unprotect(protectedValue, SocialProvider.Bluesky);
			if (roundTripped != Sentinel) {
				throw new InvalidOperationException(
					"Master key round-trip produced an unexpected value."
				);
			}
		} catch (Exception ex) {
			throw new InvalidOperationException(
				"SOCIAL_ACCOUNTS_MASTER_KEY is missing or wrong: the social-account key ring "
					+ "cannot be protected/unprotected. The API/worker will not start. "
					+ "Generate a 32-byte key (openssl rand -base64 32) and set "
					+ "SOCIAL_ACCOUNTS_MASTER_KEY for api, worker, and migrate services.",
				ex
			);
		}
	}
}
