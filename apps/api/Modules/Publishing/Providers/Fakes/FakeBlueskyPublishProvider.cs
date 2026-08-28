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
	private const string Collection = "app.bsky.feed.post";

	public Task<PublishResult> PublishAsync(
		PublishRequest request,
		CancellationToken cancellationToken
	) {
		var rkey = $"pub-{request.IdempotencyKey}";
		var did = request.Session.Did;
		var recordId = $"at://{did}/{Collection}/{rkey}";
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

		return GetOptionalBool(
			"PUBLISHING_FAKE_PROVIDER",
			defaultValue: false
		);
	}

	// Local mirror of AppEnvironment.GetOptionalBool: reading this flag must work
	// BEFORE AppEnvironment.Initialize() runs (ServiceRegistration executes during
	// builder composition), and the knob deliberately stays out of the validated
	// environment set so it can never leak into a real deployment surface.
	private static bool GetOptionalBool(string name, bool defaultValue) {
		var value = Environment.GetEnvironmentVariable(name);

		if (string.IsNullOrWhiteSpace(value)) {
			return defaultValue;
		}

		return bool.TryParse(value, out var parsed) ? parsed : defaultValue;
	}
}
