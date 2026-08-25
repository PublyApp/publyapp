using System.Security.Cryptography;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// The deterministic publication idempotency key (Epic A §4.1, Epic D §2): derived
/// from the publication row id alone, so the SAME publication yields the SAME key
/// on every enqueue attempt and every retry. It keys job_queue's in-flight dedup
/// (F13) and becomes the Bluesky record key suffix in BlueskyPublishProvider — a
/// retry after a timeout collides with the already-created record instead of
/// duplicating it. SHA-256 truncated to 128 bits: deterministic, collision-safe
/// for UUIDv7 inputs, lowercase hex is safe inside an at-proto record key.
/// </summary>
public static class PublicationIdempotencyKey {
	public static string For(Guid publicationId) {
		var hash = SHA256.HashData(publicationId.ToByteArray());
		return Convert.ToHexString(hash, 0, 16).ToLowerInvariant();
	}
}
