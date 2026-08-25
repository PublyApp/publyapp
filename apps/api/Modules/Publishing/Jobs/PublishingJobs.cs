using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Modules.Publishing.Lib;

namespace PublyApp.Api.Modules.Publishing.Jobs;

/// <summary>
/// Payload for <c>publishing.publish-publication.v1</c>. IDs plus the DERIVED
/// idempotency key: the key is fully derivable from the publication id (defense in
/// depth — <see cref="PublishingJobs"/> rejects a mismatching key at enqueue), but it
/// rides the payload so the wire contract states the dedup intent explicitly instead
/// of leaving every reader to rediscover the derivation. The handler reloads the
/// publication fresh at run time.
/// </summary>
public sealed record PublishPublicationPayload {
	public required Guid PublicationId { get; init; }

	public required string IdempotencyKey { get; init; }
}

/// <summary>
/// The publishing-domain job definition catalog (Epic A §5.1/F14/F15). Producers
/// enqueue ONLY through <see cref="PublishPublicationV1"/> via <see cref="IJobEnqueuer"/>
/// — never by writing job_queue directly. Bulk priority 0; three attempts before the
/// engine dead-letters (brief §5: transient failures retry with backoff, then DLQ).
/// </summary>
public static class PublishingJobs {
	// Single source of the versioned dispatch key; referenced from the definition
	// below AND from its Validate hook (a self-referential field read inside its own
	// initializer is a nullability error, so the key is a local const instead).
	public const string PublishPublicationV1JobType = "publishing.publish-publication.v1";

	public static readonly JobDefinition<PublishPublicationPayload> PublishPublicationV1 =
		new() {
			JobType = PublishPublicationV1JobType,
			Priority = 0,
			MaxAttempts = 3,
			Validate = payload => {
				var expected = PublicationIdempotencyKey.For(payload.PublicationId);
				if (!string.Equals(payload.IdempotencyKey, expected, StringComparison.Ordinal)) {
					throw new InvalidOperationException(
						$"Job '{PublishPublicationV1JobType}' payload IdempotencyKey "
							+ $"'{payload.IdempotencyKey}' does not match the key derived from "
							+ $"the publication id ('{expected}')."
					);
				}
			},
		};
}
