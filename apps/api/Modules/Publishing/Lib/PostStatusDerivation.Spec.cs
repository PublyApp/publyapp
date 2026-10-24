using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Lib;

public sealed class PostStatusDerivationSpec {
	private static Publication _WithStatus(PublicationStatus status) {
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
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Published),
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Failed),
		};

		PostStatusDerivation.Derive(publications).Should().Be(DerivedPostStatus.Failed);
	}

	[Fact]
	public void ItShouldBePublishedWhenAllArePublished() {
		var publications = new[] {
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Published),
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Published),
		};

		PostStatusDerivation.Derive(publications).Should().Be(DerivedPostStatus.Published);
	}

	[Fact]
	public void ItShouldBeScheduledWhenAllAreScheduled() {
		var publications = new[] {
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Scheduled),
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Scheduled),
		};

		PostStatusDerivation.Derive(publications)
			.Should().Be(DerivedPostStatus.Scheduled);
	}

	[Fact]
	public void ItShouldBePartialForAMixWithoutFailures() {
		var publications = new[] {
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Scheduled),
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Published),
			PostStatusDerivationSpec._WithStatus(PublicationStatus.InProgress),
			PostStatusDerivationSpec._WithStatus(PublicationStatus.Paused),
		};

		PostStatusDerivation.Derive(publications).Should().Be(DerivedPostStatus.Partial);
	}

	private static readonly Guid _TenantId = Guid.NewGuid();
	private static readonly Guid _PostId = Guid.NewGuid();
	private static readonly DateTime _Start = new(2026, 9, 1, 8, 0, 0, DateTimeKind.Utc);

	// One row of THE post, created `minute` minutes after the start.
	private static Publication _Row(
		PublicationStatus status,
		Guid accountId,
		int minute,
		bool isDeleted = false
	) {
		return new Publication {
			Id = Guid.CreateVersion7(),
			TenantId = PostStatusDerivationSpec._TenantId,
			PostId = PostStatusDerivationSpec._PostId,
			SocialAccountId = accountId,
			Status = status,
			ScheduledAtUtc = PostStatusDerivationSpec._Start,
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = "x",
			CreatedAt = PostStatusDerivationSpec._Start.AddMinutes(minute),
			IsDeleted = isDeleted,
		};
	}

	[Fact]
	public void ItShouldKeepFailedAndCountOnePublishedOfTwoDestinations() {
		var rows = new[] {
			PostStatusDerivationSpec._Row(PublicationStatus.Published, Guid.NewGuid(), 0),
			PostStatusDerivationSpec._Row(PublicationStatus.Failed, Guid.NewGuid(), 0),
		};

		var summary = PostStatusDerivation.Summarize(rows);

		summary.Status.Should().Be(DerivedPostStatus.Failed);
		summary.PublishedCount.Should().Be(1);
		summary.DestinationCount.Should().Be(2);
	}

	[Fact]
	public void ItShouldIgnoreAFailedPublicationANewerOneReplaced() {
		var account = Guid.NewGuid();
		var rows = new[] {
			PostStatusDerivationSpec._Row(PublicationStatus.Failed, account, 0),
			PostStatusDerivationSpec._Row(PublicationStatus.Published, account, 5),
		};

		var summary = PostStatusDerivation.Summarize(rows);

		summary.Status.Should().Be(DerivedPostStatus.Published);
		summary.PublishedCount.Should().Be(1);
		summary.DestinationCount.Should().Be(1);
	}

	[Fact]
	public void ItShouldStillCountAFailedPublicationNothingReplaced() {
		var account = Guid.NewGuid();
		var rows = new[] {
			PostStatusDerivationSpec._Row(PublicationStatus.Failed, account, 5),
			// Older than the failure: it does not replace it.
			PostStatusDerivationSpec._Row(PublicationStatus.Published, account, 0),
		};

		var summary = PostStatusDerivation.Summarize(rows);

		summary.Status.Should().Be(DerivedPostStatus.Failed);
		summary.DestinationCount.Should().Be(2);
	}

	[Fact]
	public void ItShouldLetASoftDeletedNewerRowReplaceAFailureWithoutCountingItself() {
		var account = Guid.NewGuid();
		var rows = new[] {
			PostStatusDerivationSpec._Row(PublicationStatus.Failed, account, 0),
			PostStatusDerivationSpec._Row(PublicationStatus.Scheduled, account, 5, isDeleted: true),
			PostStatusDerivationSpec._Row(PublicationStatus.Published, Guid.NewGuid(), 0),
		};

		var summary = PostStatusDerivation.Summarize(rows);

		summary.Status.Should().Be(DerivedPostStatus.Published);
		summary.PublishedCount.Should().Be(1);
		summary.DestinationCount.Should().Be(1);
	}

	[Fact]
	public void ItShouldSummarizeAPostWithoutPublicationsAsAnEmptyDraft() {
		var summary = PostStatusDerivation.Summarize([]);

		summary.Status.Should().Be(DerivedPostStatus.Draft);
		summary.PublishedCount.Should().Be(0);
		summary.DestinationCount.Should().Be(0);
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
