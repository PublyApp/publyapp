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

	// The post's images in publish order (empty for a text-only post).
	public IReadOnlyList<PublishMedia> Media { get; init; } = [];

	// Thread follow-ups (#2171): the texts of segments 2..N in order, each published
	// as a reply to the segment before it. Empty = a plain single post.
	public IReadOnlyList<string> FollowUpSegments { get; init; } = [];

	// Segments (0-based position) a previous attempt already published, with the
	// uri/cid the chain continues from. They are never published again.
	public IReadOnlyList<CompletedSegment> CompletedSegments { get; init; } = [];

	// Called right after EACH newly created (or read back) segment of a thread, so
	// progress is persisted before the next segment is attempted.
	public Func<CompletedSegment, CancellationToken, Task>? OnSegmentCompleted { get; init; }
}

/// <summary>A published thread segment: <see cref="Position"/> is 0-based (0 = root).</summary>
public sealed record CompletedSegment(int Position, string RecordId, string Cid, string RecordUrl);

/// <summary>
/// One image of the post, already read from storage by the job handler. Width and
/// height are the intrinsic pixel size of <see cref="Content"/> as stored.
/// </summary>
public sealed record PublishMedia {
	public required byte[] Content { get; init; }

	public required string ContentType { get; init; }

	public string? AltText { get; init; }

	public required int WidthPx { get; init; }

	public required int HeightPx { get; init; }
}
