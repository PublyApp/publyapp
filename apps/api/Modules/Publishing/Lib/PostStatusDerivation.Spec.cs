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

	[Theory]
	[InlineData(DerivedPostStatus.Draft, "draft")]
	[InlineData(DerivedPostStatus.Scheduled, "scheduled")]
	[InlineData(DerivedPostStatus.Published, "published")]
	[InlineData(DerivedPostStatus.Partial, "partial")]
	// Snake_case: closed switch must emit the SAME vocabulary as the status
	// formatter (PUBLY0003: ToLower* is never a contract-conversion strategy).
	// #1911 decision: InProgress is NOT a derived post status — Derive() never
	// produces it; keeping the wire value would be dead product surface.
	[InlineData(DerivedPostStatus.Failed, "failed")]
	public void ItShouldEmitSnakeCaseWireValuesForEveryDerivedStatus(
		DerivedPostStatus status,
		string expectedWireValue
	) {
		// Round-2 finding: the queue contract used ToString().ToLowerInvariant()
		// next to the closed-snake_case publication status. The closed switch
		// must emit the SAME vocabulary as the status formatter (PUBLY0003:
		// ToLower* is never a contract-conversion strategy).
		PostStatusDerivation.FormatPostStatus(status)
			.Should().Be(expectedWireValue);
	}

	[Fact]
	public void ItShouldRefuseADerivedStatusWithoutAWireValue() {
		// #1911: the closed-switch contract (round-2 finding) is that a value
		// with no wire mapping fails LOUDLY instead of being invented. The
		// lowercase-the-member-name mutation that keeps every single-word table
		// row green silently returns "999" here — this assertion is what pins
		// the switch's closure, not its per-member strings.
		var act = () => PostStatusDerivation.FormatPostStatus((DerivedPostStatus)999);

		act.Should().Throw<ArgumentOutOfRangeException>()
			.WithMessage("*Unhandled DerivedPostStatus*");
	}
}
