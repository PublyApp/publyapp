using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Providers.Capabilities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

public sealed class PublishValidationServiceSpec {
	private const string _Family =
		"\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466";

	private static PublishContentFailure _Failure(PublishContentFailure? failure) {
		Assert.NotNull(failure);
		return failure;
	}

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

	[Fact]
	public void ItShouldRefuseAPostWithoutAnImageForAPhotoNetwork() {
		var failure = PublishValidationService.Validate("caption", [], [ProviderCapabilityRegistry.Pixelfed]);

		Assert.NotNull(failure);
		failure.Kind.Should().Be(PublishContentFailureKind.MediaRequired);
		failure.Provider.Should().Be("pixelfed");
		failure.Cause.Should().Contain("at least one image");
		PublishValidationService.Validate("", ["image/png"], [ProviderCapabilityRegistry.Pixelfed]).Should().BeNull();
		PublishValidationService.Validate("caption", ["image/png"], [ProviderCapabilityRegistry.Pixelfed]).Should().BeNull();
	}

	[Fact]
	public void ItShouldJudgeEachDestinationOfAMixedPostOnItsOwn() {
		ProviderCapability[] all = [
			ProviderCapabilityRegistry.Bluesky,
			ProviderCapabilityRegistry.Pixelfed,
			ProviderCapabilityRegistry.DiscordWebhook,
		];

		// Text only: Pixelfed (needs an image) is the one that fails, not Bluesky or Discord.
		PublishValidationServiceSpec._Failure(PublishValidationService.Validate("hello", [], all)).Provider.Should().Be("pixelfed");
		// 301 characters: only Bluesky's 300 trips; Pixelfed and Discord take it.
		PublishValidationServiceSpec._Failure(PublishValidationService.Validate(new string('a', 301), ["image/png"], all)).Provider.Should().Be("bluesky");
		// 501 characters: Pixelfed's caption limit.
		PublishValidationServiceSpec._Failure(PublishValidationService.Validate(
			new string('a', 501), ["image/png"], [ProviderCapabilityRegistry.Pixelfed, ProviderCapabilityRegistry.DiscordWebhook]
		)).Provider.Should().Be("pixelfed");
		// 2001: Discord's limit.
		PublishValidationServiceSpec._Failure(PublishValidationService.Validate(
			new string('a', 2001), [], [ProviderCapabilityRegistry.DiscordWebhook]
		)).Provider.Should().Be("discord_webhook");
	}

	[Fact]
	public void ItShouldAcceptTenImagesForDiscordAndRefuseElevenOrAThreadFollowUp() {
		var ten = Enumerable.Repeat("image/png", 10).ToList();

		PublishValidationService.Validate("hi", ten, [ProviderCapabilityRegistry.DiscordWebhook]).Should().BeNull();
		var eleven = PublishValidationService.Validate(
			"hi", [.. ten, "image/png"], [ProviderCapabilityRegistry.DiscordWebhook]
		);
		Assert.NotNull(eleven);
		eleven.Kind.Should().Be(PublishContentFailureKind.TooManyImages);
		var thread = PublishValidationService.Validate(
			"hi", [], [ProviderCapabilityRegistry.DiscordWebhook], ["second"]
		);
		Assert.NotNull(thread);
		thread.Kind.Should().Be(PublishContentFailureKind.ThreadsUnsupported);
		thread.Cause.Should().Contain("cannot publish a thread");
		PublishValidationServiceSpec._Failure(PublishValidationService.Validate(
			"hi", ["image/png"], [ProviderCapabilityRegistry.Pixelfed], ["second"]
		)).Kind.Should().Be(PublishContentFailureKind.ThreadsUnsupported);
	}
}
