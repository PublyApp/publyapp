using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Providers;

/// <summary>
/// Everything a publish provider needs to deliver ONE publication: ids and content
/// only, plus the ALREADY-opened session. How the credential was obtained (app
/// password, OAuth, anything Epic C grows later) is invisible here — the provider
/// consumes any <see cref="SocialSessionResult.Opened"/> outcome identically.
/// </summary>
public sealed record PublishRequest {
	public required Guid PublicationId { get; init; }

	// Deterministic (PublicationIdempotencyKey.For(publicationId)): becomes the
	// Bluesky record key suffix so a retry after a timeout collides instead of
	// duplicating (Epic A §4.1).
	public required string IdempotencyKey { get; init; }

	public required string PostBody { get; init; }

	// The exact instant the scheduler claims on; stamped as the record's createdAt.
	public required DateTime ScheduledAtUtc { get; init; }

	public required SocialSession Session { get; init; }
}
