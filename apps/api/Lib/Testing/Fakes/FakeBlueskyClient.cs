using System.Collections.Concurrent;

using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

namespace PublyApp.Api.Lib.Testing.Fakes;

/// <summary>
/// Fake Bluesky client for integration specs (spec §6: "faked in every spec — never
/// the real network"). Mirrors <see cref="FakeEmailSender"/> ergonomics: records every
/// open attempt, programmable outcome via <see cref="NextResult"/>, deterministic
/// success mapping by default.
///
/// IMPORTANT: registered as a singleton per ApiFixture. Attempts persist across every
/// test method sharing that fixture — specs needing isolation must own an exclusive
/// ApiFixture rather than resetting a shared instance.
/// </summary>
public sealed class FakeBlueskyClient : IBlueskyClient {
	public sealed record CreateAttempt(string Identifier);

	private readonly ConcurrentQueue<CreateAttempt> _attempts = new();

	/// <summary>All recorded attempts in arrival order.</summary>
	public IReadOnlyList<CreateAttempt> Attempts {
		get { return _attempts.ToList(); }
	}

	/// <summary>
	/// When set, every call returns it instead of the default success. Reset to null to
	/// restore default behaviour within one spec's own phases.
	/// </summary>
	public BlueskySessionResult? NextResult { get; set; }

	public Task<BlueskySessionResult> CreateSessionAsync(
		BlueskyCredentials credentials,
		CancellationToken cancellationToken = default
	) {
		_attempts.Enqueue(new CreateAttempt(credentials.Identifier));

		if (NextResult is not null) {
			return Task.FromResult(NextResult);
		}

		// Deterministic identity derived from the identifier so specs can assert exact
		// DID/handle without any network. Never echoes the app password anywhere.
		var seed = Math.Abs((long)StringComparer.Ordinal.GetHashCode(credentials.Identifier));
		var did = $"did:plc:{seed:x16}";
		var handle = $"{credentials.Identifier.Split('@')[0]}.test";
		return Task.FromResult<BlueskySessionResult>(
			new BlueskySessionResult.Success(
				new BlueskyIdentity(did, handle),
				AccessJwt: $"fake-access-token-{seed:x8}",
				PdsHost: "https://bsky.social"
			)
		);
	}

	/// <summary>Clears recorded attempts (single-test phase resets only; see class remarks).</summary>
	public void Clear() {
		_attempts.Clear();
	}
}
