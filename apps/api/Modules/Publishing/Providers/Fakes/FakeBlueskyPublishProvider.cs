namespace PublyApp.Api.Modules.Publishing.Providers.Fakes;

/// <summary>
/// Test-only Bluesky delivery (plan D2 reconciliation 4, round-2 blocker fix):
/// answers every publish with success and a DETERMINISTIC record identity derived
/// from the publication's idempotency key — the same key contract production uses —
/// so a retried job recomputes the same record/URL instead of minting a second one.
/// Registered ONLY when PUBLISHING_FAKE_PROVIDER=1 on a Development/Testing host;
/// Production refuses the flag entirely (fail closed in
/// <see cref="FakePublishingProviderEnabled.IsEnabled"/>). Never ships fixture data,
/// never contacts a PDS.
/// </summary>
public sealed class FakeBlueskyPublishProvider : IPublishProvider {
	// Same collection constant the real provider writes; kept literal here so the
	// fake has no dependency on the real client's HTTP surface.
	private const string _Collection = "app.bsky.feed.post";

	private static readonly System.Collections.Concurrent.ConcurrentQueue<RecordedPublish> _Recorded = new();

	/// <summary>Every publish the fake received, oldest first (images in order).</summary>
	public static IReadOnlyList<RecordedPublish> Recorded {
		get { return FakeBlueskyPublishProvider._Recorded.ToArray(); }
	}

	public static void ClearRecorded() {
		FakeBlueskyPublishProvider._Recorded.Clear();
	}

	public sealed record RecordedImage(string ContentType, string? AltText, int SizeBytes);

	public sealed record RecordedPublish(string IdempotencyKey, IReadOnlyList<RecordedImage> Images);

	public Task<PublishResult> PublishAsync(
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		FakeBlueskyPublishProvider._Recorded.Enqueue(
			new RecordedPublish(
				request.IdempotencyKey,
				request.Media
					.Select(media => new RecordedImage(media.ContentType, media.AltText, media.Content.Length))
					.ToList()
			)
		);
		var rkey = $"pub-{request.IdempotencyKey}";
		var did = request.Session.Did;
		var recordId = $"at://{did}/{FakeBlueskyPublishProvider._Collection}/{rkey}";
		var url = $"https://bsky.app/profile/{did}/post/{rkey}";

		return Task.FromResult<PublishResult>(
			new PublishResult.Published(recordId, url)
		);
	}
}

public static partial class FakePublishingProviderEnabled {
	public static bool IsEnabled() {
		// Fail closed on every ambiguous host: allow only Development/Testing
		// explicitly. An UNSET ASPNETCORE_ENVIRONMENT resolves to Production already
		// (AppEnvironment host classification), but do not lean on that here.
		if (
			!PublyApp.Api.Lib.AppEnvironment.IsProbeAllowedHostEnvironment()
		) {
			return false;
		}

		return FakePublishingProviderEnabled._GetOptionalBool(
			"PUBLISHING_FAKE_PROVIDER",
			defaultValue: false
		);
	}

	// Local mirror of AppEnvironment._GetOptionalBool: reading this flag must work
	// BEFORE AppEnvironment.Initialize() runs (ServiceRegistration executes during
	// builder composition), and the knob deliberately stays out of the validated
	// environment set so it can never leak into a real deployment surface.
	private static bool _GetOptionalBool(string name, bool defaultValue) {
		var value = Environment.GetEnvironmentVariable(name);

		if (string.IsNullOrWhiteSpace(value)) {
			return defaultValue;
		}

		return bool.TryParse(value, out var parsed) ? parsed : defaultValue;
	}
}
