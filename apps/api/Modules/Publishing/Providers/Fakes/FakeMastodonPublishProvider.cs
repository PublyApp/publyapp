using System.Security.Cryptography;
using System.Text;

using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Providers.Fakes;

/// <summary>
/// Test-only Mastodon / Pixelfed delivery (#2186), the sibling of
/// <see cref="FakeBlueskyPublishProvider"/>: answers every publish with success and a
/// DETERMINISTIC status identity derived from the per-segment idempotency key (the same
/// <see cref="MastodonPublishProvider.SegmentKey"/> contract production sends to the
/// instance), so a retried job recomputes the same status instead of minting a second one.
/// It records what the real provider would have put on the wire (visibility, images,
/// segment texts) so an e2e or spec can assert on it. Selected by
/// <see cref="FakeRoutingPublishProvider"/> under the same
/// <c>PUBLISHING_FAKE_PROVIDER=1</c> gate as the Bluesky fake (Development/Testing hosts
/// only); never contacts an instance.
/// </summary>
public sealed class FakeMastodonPublishProvider : IPublishProvider {
	private const string _Host = "https://mastodon.fake.test";

	private static readonly System.Collections.Concurrent.ConcurrentQueue<RecordedPublish> _Recorded = new();

	/// <summary>Every publish the fake received, oldest first.</summary>
	public static IReadOnlyList<RecordedPublish> Recorded {
		get { return FakeMastodonPublishProvider._Recorded.ToArray(); }
	}

	public static void ClearRecorded() {
		FakeMastodonPublishProvider._Recorded.Clear();
	}

	public sealed record RecordedImage(string ContentType, string? AltText, int SizeBytes);

	public sealed record RecordedPublish(
		string IdempotencyKey,
		SocialProvider Provider,
		string Visibility,
		IReadOnlyList<string> Texts,
		IReadOnlyList<RecordedImage> Images
	);

	public async Task<PublishResult> PublishAsync(
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		// Same refusal the real delivery makes, so an e2e of a Pixelfed post without an
		// image sees the real failure rather than a fake success.
		// Only the root carries the image, so a thread resumed after its root is not asked again.
		var rootDone = request.CompletedSegments.Any(segment => segment.Position == 0);
		if (request.Provider == SocialProvider.Pixelfed && request.Media.Count == 0 && !rootDone) {
			return new PublishResult.ContentFailure("Pixelfed posts need at least one image");
		}

		var texts = new List<string>(request.FollowUpSegments.Count + 1) { request.PostBody };
		texts.AddRange(request.FollowUpSegments);
		FakeMastodonPublishProvider._Recorded.Enqueue(
			new RecordedPublish(
				request.IdempotencyKey,
				request.Provider,
				SocialAccountWire.FormatVisibility(request.Visibility),
				texts,
				request.Media
					.Select(media => new RecordedImage(media.ContentType, media.AltText, media.Content.Length))
					.ToList()
			)
		);

		var completed = request.CompletedSegments.Select(segment => segment.Position).ToHashSet();
		PublishResult rootResult = new PublishResult.ContentFailure("no root segment");
		for (var position = 0; position < texts.Count; position++) {
			var id = FakeMastodonPublishProvider._StatusId(
				MastodonPublishProvider.SegmentKey(request.IdempotencyKey, position)
			);
			var url = $"{FakeMastodonPublishProvider._Host}/@e2e/{id}";
			if (position == 0) {
				rootResult = new PublishResult.Published(id, url);
			}

			if (!completed.Contains(position) && request.OnBeforeWrite is not null) {
				await request.OnBeforeWrite(position, cancellationToken);
			}

			if (texts.Count > 1 && !completed.Contains(position) && request.OnSegmentCompleted is not null) {
				await request.OnSegmentCompleted(
					new CompletedSegment(position, id, string.Empty, url),
					cancellationToken
				);
			}
		}

		return rootResult;
	}

	// A numeric-looking id like a Mastodon snowflake, stable for one key.
	private static string _StatusId(string segmentKey) {
		var hash = SHA256.HashData(Encoding.UTF8.GetBytes(segmentKey));
		return "1" + Convert.ToHexString(hash, 0, 8).ToLowerInvariant();
	}
}

/// <summary>
/// The delivery registered when <c>PUBLISHING_FAKE_PROVIDER=1</c>: a Mastodon or Pixelfed
/// target goes to <see cref="FakeMastodonPublishProvider"/>, everything else keeps going
/// to <see cref="FakeBlueskyPublishProvider"/> exactly as before (#2186). Same gate, same
/// fail-closed rule: <see cref="FakePublishingProviderEnabled.IsEnabled"/>.
/// </summary>
public sealed class FakeRoutingPublishProvider : IPublishProvider {
	private readonly FakeBlueskyPublishProvider _Bluesky = new();
	private readonly FakeMastodonPublishProvider _Mastodon = new();

	public Task<PublishResult> PublishAsync(PublishRequest request, CancellationToken cancellationToken) {
		return request.Provider is SocialProvider.Mastodon or SocialProvider.Pixelfed
			? this._Mastodon.PublishAsync(request, cancellationToken)
			: this._Bluesky.PublishAsync(request, cancellationToken);
	}

	// Mastodon's own reconcile rule (the 50 min window), so the e2e does not silently inherit
	// the interface default for a provider whose real delivery overrides it.
	Task<ReconcileResult> IPublishProvider.ReconcileAsync(
		ReconcileRequest request,
		CancellationToken cancellationToken
	) {
		return request.Provider is SocialProvider.Mastodon or SocialProvider.Pixelfed
			? Task.FromResult(MastodonPublishProvider.Reconcile(request))
			: ((IPublishProvider)this._Bluesky).ReconcileAsync(request, cancellationToken);
	}
}
