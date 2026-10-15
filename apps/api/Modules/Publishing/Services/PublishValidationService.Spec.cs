using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Providers.Capabilities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

public sealed class PublishValidationServiceSpec {
	private const string _Family =
		"\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466";

	private static PublishContentFailure? _Validate(string body, params string[] imageTypes) {
		return PublishValidationService.Validate(body, imageTypes, [ProviderCapabilityRegistry.Bluesky]);
	}

	[Fact]
	public void ItShouldHoldEveryThreadSegmentToTheSameLimitsAndNameTheOffender() {
		string[] followUps = ["fine", new string('b', 301), ""];

		var tooLong = PublishValidationService.Validate(
			"first", [], [ProviderCapabilityRegistry.Bluesky], followUps
		);

		Assert.NotNull(tooLong);
		tooLong.Kind.Should().Be(PublishContentFailureKind.TooLong);
		tooLong.SegmentNumber.Should().Be(3);
		tooLong.Cause.Should().StartWith("Segment 3:");

		var empty = PublishValidationService.Validate(
			"first", [], [ProviderCapabilityRegistry.Bluesky], ["fine", "  "]
		);
		Assert.NotNull(empty);
		empty.Kind.Should().Be(PublishContentFailureKind.Empty);
		empty.SegmentNumber.Should().Be(3);

		PublishValidationService.Validate(
			"first", [], [ProviderCapabilityRegistry.Bluesky], ["fine", new string('c', 300)]
		).Should().BeNull();
	}

	[Fact]
	public void ItShouldCountTheFirstSegmentOfAThreadLikeAnyOther() {
		var failure = PublishValidationService.Validate(
			new string('a', 301), [], [ProviderCapabilityRegistry.Bluesky], ["fine"]
		);

		Assert.NotNull(failure);
		failure.SegmentNumber.Should().Be(1);
	}

	[Fact]
	public void ItShouldAccept300GraphemesAndRejectWith301() {
		PublishValidationServiceSpec._Validate(new string('a', 300)).Should().BeNull();

		var failure = PublishValidationServiceSpec._Validate(new string('a', 301));
		Assert.NotNull(failure);
		failure.Kind.Should().Be(PublishContentFailureKind.TooLong);
		failure.Provider.Should().Be("bluesky");
		failure.Unit.Should().Be("graphemes");
		failure.Limit.Should().Be(300);
		failure.Actual.Should().Be(301);
	}

	[Fact]
	public void ItShouldRejectTextOver3000BytesWhenGraphemesFit() {
		// 120 family emoji = 120 graphemes and exactly 3000 bytes: accepted.
		PublishValidationServiceSpec._Validate(
			string.Concat(Enumerable.Repeat(PublishValidationServiceSpec._Family, 120))
		).Should().BeNull();

		// One more byte, still far below 300 graphemes: rejected on bytes.
		var failure = PublishValidationServiceSpec._Validate(
			string.Concat(Enumerable.Repeat(PublishValidationServiceSpec._Family, 120)) + "a"
		);
		Assert.NotNull(failure);
		failure.Unit.Should().Be("bytes");
		failure.Limit.Should().Be(3000);
		failure.Actual.Should().Be(3001);
	}

	[Fact]
	public void ItShouldTrimTrailingWhitespaceBeforeCounting() {
		PublishValidationServiceSpec._Validate(new string('a', 300) + "   \r\n")
			.Should().BeNull();
	}

	[Fact]
	public void ItShouldRejectEmptyTextUnlessMediaIsAttached() {
		var failure = PublishValidationServiceSpec._Validate("  \n ");
		Assert.NotNull(failure);
		failure.Kind.Should().Be(PublishContentFailureKind.Empty);

		PublishValidationServiceSpec._Validate("  \n ", "image/png").Should().BeNull();
	}

	[Fact]
	public void ItShouldAcceptFourImagesAndRejectTheFifth() {
		PublishValidationServiceSpec._Validate("hi", "image/png", "image/jpeg", "image/webp", "image/png")
			.Should().BeNull();

		var failure = PublishValidationServiceSpec._Validate(
			"hi", "image/png", "image/png", "image/png", "image/png", "image/png"
		);
		Assert.NotNull(failure);
		failure.Kind.Should().Be(PublishContentFailureKind.TooManyImages);
		failure.Limit.Should().Be(4);
		failure.Actual.Should().Be(5);
		failure.Unit.Should().Be("images");
	}

	[Fact]
	public void ItShouldRejectAnUnsupportedImageTypeNamingTheImage() {
		var failure = PublishValidationServiceSpec._Validate("hi", "image/png", "image/gif");
		Assert.NotNull(failure);
		failure.Kind.Should().Be(PublishContentFailureKind.UnsupportedImageType);
		failure.ImageIndex.Should().Be(2);
		failure.ContentType.Should().Be("image/gif");
		failure.Cause.Should().Contain("Image 2");
	}
}
