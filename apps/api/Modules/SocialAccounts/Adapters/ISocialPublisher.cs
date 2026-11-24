using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Adapters;

/// <summary>
/// The publish half of a social adapter: exactly the two operations the publish job
/// needs, one per network. Implementations classify every outcome instead of throwing.
/// </summary>
[OnlyInjectedInto(typeof(SocialAdapterRegistry))]
public interface ISocialPublisher {
	/// <summary>Every network this adapter serves (Mastodon serves Mastodon and Pixelfed).</summary>
	IReadOnlySet<SocialProvider> Networks { get; }

	Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken cancellationToken);

	/// <summary>
	/// READ-ONLY check of an ambiguous earlier write (#2176); never writes. Every
	/// network needs its own rule, so adapters implement it instead of inheriting a
	/// default that would silently park every publication for review.
	/// </summary>
	Task<ReconcileResult> ReconcileAsync(
		ReconcileRequest request,
		CancellationToken cancellationToken
	);
}
