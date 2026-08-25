using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// The idempotency key is THE dedup identity of a publication: it keys the job_queue
/// enqueue dedup AND becomes the Bluesky record key suffix, so a retry after a
/// timeout must collide with the already-created record instead of duplicating it.
/// Determinism is therefore load-bearing — the adversarial mutation proof replaces
/// this key with randomness and expects the no-duplicate spec to go red.
/// </summary>
public sealed class PublicationIdempotencyKeySpec {
	[Fact]
	public void ItShouldReturnTheSameKeyForTheSamePublicationEveryTime() {
		var publicationId = Guid.Parse("0197bc4e-7a1b-7cc2-b3a1-3f6d9c2a1101");

		var first = PublicationIdempotencyKey.For(publicationId);
		var second = PublicationIdempotencyKey.For(publicationId);

		first.Should().Be(second);
	}

	[Fact]
	public void ItShouldReturnDistinctKeysForDistinctPublications() {
		var a = PublicationIdempotencyKey.For(Guid.NewGuid());
		var b = PublicationIdempotencyKey.For(Guid.NewGuid());

		a.Should().NotBe(b);
	}

	[Fact]
	public void ItShouldProduceALowercaseHexKeySafeForAtProtoRecordKeys() {
		var key = PublicationIdempotencyKey.For(Guid.NewGuid());

		key.Should().MatchRegex("^[0-9a-f]{32}$");
		key.Should().NotContain("-");
		key.Should().NotContain("/");
	}

	[Fact]
	public void ItShouldBeStableAcrossProcessRestarts() {
		// Pinned vector: if the derivation ever changes, every in-flight job key and
		// every stored row key diverge — this assertion makes such a change loud.
		var publicationId = Guid.Parse("0197bc4e-7a1b-7cc2-b3a1-3f6d9c2a1101");

		PublicationIdempotencyKey.For(publicationId)
			.Should().Be("208aa177a2b71236c0b4efead5f6de44");
	}
}
