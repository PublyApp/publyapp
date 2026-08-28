using PublyApp.Api.Modules.SocialAccounts.Seeders;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Fakes;

/// <summary>
/// E2E session seam (plan D2 reconciliation 4, round-2 blocker fix): resolves any
/// stored demo account to an OPENED session WITHOUT contacting Bluesky — including
/// rows seeded with the <see cref="SocialAccountSeeder.PlaceholderCredentialBlob"/>,
/// which the production <see cref="PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky.BlueskySessionProvider"/> would rightly refuse as
/// "no usable stored credential".
///
/// Registered ONLY when PUBLISHING_FAKE_PROVIDER=1 on a Development/Testing host
/// (<see cref="PublyApp.Api.Modules.Publishing.Providers.Fakes.FakePublishingProviderEnabled.IsEnabled"/>); real deployments keep
/// credential validation and needs-reconnect semantics untouched. The identity is
/// derived deterministically from the account id so distinct accounts keep distinct
/// identities in history links.
/// </summary>
public sealed class FakeBlueskySessionProvider : ISocialSessionProvider {
	public Task<SocialSessionResult> OpenSessionAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		// Deliberately stateless: no DbContext, nothing to race or mutate. The e2e
		// stack publishes only through accounts the demo seeder created; folding the
		// account id into the DID keeps identities distinct per account.
		var seed =
			Math.Abs((long)socialAccountId.GetHashCode())
			+ Math.Abs((long)StringComparer.Ordinal.GetHashCode(
				SocialAccountSeeder.PlaceholderCredentialBlob));
		var did = $"did:plc:{seed:x16}";

		return Task.FromResult<SocialSessionResult>(
			new SocialSessionResult.Opened(new SocialSession(
				Did: did,
				Handle: "e2e.fake.test",
				AccessJwt: $"fake-e2e-access-{seed:x8}",
				PdsHost: "https://bsky.social"
			))
		);
	}
}
