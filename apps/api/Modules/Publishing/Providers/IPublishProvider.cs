using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// The delivery seam between the publishing domain and a social provider (Epic D
/// §3). The publish job depends on THIS interface only; BlueskyPublishProvider is
/// the first implementation. Implementations classify every outcome into a
/// <see cref="PublishResult"/> kind — they never throw for classified failures.
/// </summary>
public interface IPublishProvider {
	Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken cancellationToken);

	/// <summary>
	/// READ-ONLY check of an ambiguous earlier write (#2176); never writes. The default
	/// is "cannot look it up", which parks the publication for the user to review.
	/// </summary>
	Task<ReconcileResult> ReconcileAsync(
		ReconcileRequest request,
		CancellationToken cancellationToken
	) {
		return Task.FromResult<ReconcileResult>(
			new ReconcileResult.NeedsReview("this provider cannot confirm whether the post went out")
		);
	}
}

public sealed record ReconcileRequest {
	public required Guid PublicationId { get; init; }
	public required string IdempotencyKey { get; init; }
	public required int SegmentPosition { get; init; }
	public required SocialSession Session { get; init; }
	public SocialProvider Provider { get; init; } = SocialProvider.Bluesky;

	/// <summary>When this segment was FIRST sent (a dedupe window runs from there).</summary>
	public required DateTime FirstAttemptAtUtc { get; init; }
}

/// <summary>Outcome of reconciling one ambiguous write.</summary>
public abstract record ReconcileResult {
	/// <summary>The record exists: record it as published and continue after it.</summary>
	public sealed record Found(CompletedSegment Segment) : ReconcileResult;

	/// <summary>Confirmed absent, or a resend is deduplicated by the provider: write again.</summary>
	public sealed record SafeToResend : ReconcileResult;

	/// <summary>Existence cannot be ruled out: ask the user, never resend.</summary>
	public sealed record NeedsReview(string Cause) : ReconcileResult;

	/// <summary>The lookup itself failed: back off and look again.</summary>
	public sealed record Unavailable(string Cause) : ReconcileResult;
}
