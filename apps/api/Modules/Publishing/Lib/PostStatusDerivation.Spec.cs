using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Lib;

public sealed class PostStatusDerivationSpec {
	private static Publication WithStatus(PublicationStatus status) {
		return new Publication {
			TenantId = Guid.NewGuid(),
			PostId = Guid.NewGuid(),
			SocialAccountId = Guid.NewGuid(),
			Status = status,
			ScheduledAtUtc = new DateTime(2026, 9, 1, 8, 0, 0, DateTimeKind.Utc),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = "x",
		};
	}

	[Fact]
	public void ItShouldBeDraftWhenThereIsNoPublication() {
		PostStatusDerivation.Derive([]).Should().Be(DerivedPostStatus.Draft);
	}

	[Fact]
	public void ItShouldBeFailedWhenAnyPublicationFailed() {
		var publications = new[] {
			WithStatus(PublicationStatus.Published),
			WithStatus(PublicationStatus.Failed),
		};

		PostStatusDerivation.Derive(publications).Should().Be(DerivedPostStatus.Failed);
	}

	[Fact]
	public void ItShouldBePublishedWhenAllArePublished() {
		var publications = new[] {
			WithStatus(PublicationStatus.Published),
			WithStatus(PublicationStatus.Published),
		};

		PostStatusDerivation.Derive(publications).Should().Be(DerivedPostStatus.Published);
	}

	[Fact]
	public void ItShouldBeScheduledWhenAllAreScheduled() {
		var publications = new[] {
			WithStatus(PublicationStatus.Scheduled),
			WithStatus(PublicationStatus.Scheduled),
		};

		PostStatusDerivation.Derive(publications)
			.Should().Be(DerivedPostStatus.Scheduled);
	}

	[Fact]
	public void ItShouldBePartialForAMixWithoutFailures() {
		var publications = new[] {
			WithStatus(PublicationStatus.Scheduled),
			WithStatus(PublicationStatus.Published),
			WithStatus(PublicationStatus.InProgress),
			WithStatus(PublicationStatus.Paused),
		};

		PostStatusDerivation.Derive(publications).Should().Be(DerivedPostStatus.Partial);
	}
}
