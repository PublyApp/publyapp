using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Transitional placeholder for <see cref="ISocialSessionProvider"/> while Epic C
/// (lane wt-641) has not landed its real Bluesky implementation. RESOLVABLE but
/// never usable: every call throws loudly, so a publish job can never run against
/// a fake session. Deleted naturally at the convergence rebase, where wt-641's
/// last-wins registration replaces this placeholder entirely.
/// </summary>
public sealed class UnimplementedSocialSessionAdapter : ISocialSessionProvider {
	public Task<SocialSessionResult> OpenSessionAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		throw new InvalidOperationException(
			"ISocialSessionProvider has no implementation registered. "
				+ "Epic C (lane wt-641) owns the Bluesky implementation; D1 only "
				+ "consumes the seam."
		);
	}
}
