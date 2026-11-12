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
	public void ItShouldHoldEveryFollowUpsImagesToTheDestinationsCapabilityAndNameTheSegment() {
		string[] followUps = ["fine", "also fine"];
		var bluesky = new[] { ProviderCapabilityRegistry.Bluesky };

		var tooMany = PublishValidationService.Validate(
			"first", [], bluesky, followUps,
			[[], ["image/png", "image/png", "image/png", "image/png", "image/png"]]
		);
		Assert.NotNull(tooMany);
		tooMany.Kind.Should().Be(PublishContentFailureKind.TooManyImages);
		tooMany.SegmentNumber.Should().Be(3);
		tooMany.Limit.Should().Be(4);
		tooMany.Cause.Should().StartWith("Segment 3:");

		var wrongType = PublishValidationService.Validate(
			"first", [], bluesky, followUps, [["image/gif"], []]
		);
		Assert.NotNull(wrongType);
		wrongType.Kind.Should().Be(PublishContentFailureKind.UnsupportedImageType);
		wrongType.SegmentNumber.Should().Be(2);
		wrongType.ImageIndex.Should().Be(1);

		PublishValidationService.Validate(
			"first", [], bluesky, followUps, [["image/png", "image/jpeg"], ["image/webp"]]
		).Should().BeNull();
	}

	[Fact]
	public void ItShouldAcceptAnImageOnlyFollowUpButStillRefuseAnEmptyOneWithNoImage() {
		var bluesky = new[] { ProviderCapabilityRegistry.Bluesky };

		PublishValidationService.Validate(
			"first", [], bluesky, ["  "], [["image/png"]]
		).Should().BeNull();

		var empty = PublishValidationService.Validate("first", [], bluesky, ["  "], [[]]);
		Assert.NotNull(empty);
		empty.Kind.Should().Be(PublishContentFailureKind.Empty);
		empty.SegmentNumber.Should().Be(2);
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

	// #2184: the image-type cause is templated from the destination's own accepted types,
	// so it never promises a type (WebP) a destination refuses nor names another network's.
	[Fact]
	public void ItShouldListTheAcceptedImageTypesOfTheDestinationInTheCause() {
		var pixelfed = PublishValidationService.Validate("hi", ["image/webp"], [ProviderCapabilityRegistry.Pixelfed]);
		var bluesky = PublishValidationService.Validate("hi", ["image/gif"], [ProviderCapabilityRegistry.Bluesky]);

		PublishValidationServiceSpec._Failure(pixelfed).Cause
			.Should().Contain("Use a JPEG or PNG image.").And.NotContain("WebP");
		PublishValidationServiceSpec._Failure(bluesky).Cause
			.Should().Contain("Use a JPEG, PNG or WebP image.").And.NotContain("static");
	}

	[Fact]
	public void ItShouldFollowACapabilityThatAcceptsASingleImageType() {
		var onlyPng = ProviderCapabilityRegistry.Mastodon with { AcceptedImageContentTypes = ["image/png"] };

		PublishValidationServiceSpec._Failure(PublishValidationService.Validate("hi", ["image/jpeg"], [onlyPng])).Cause
			.Should().Contain("Use a PNG image.");
	}

	// #2184: alt text is a capability, not a Bluesky/Mastodon assumption.
	[Fact]
	public void ItShouldRequireAltTextOnEveryImageOnlyWhenTheCapabilityAsksForIt() {
		var strict = ProviderCapabilityRegistry.Mastodon with { RequiresAltText = true };
		string?[] alts = ["a cat", " "];

		var failure = PublishValidationServiceSpec._Failure(PublishValidationService.Validate(
			"hi", ["image/png", "image/png"], [strict], null, alts
		));
		failure.Kind.Should().Be(PublishContentFailureKind.AltTextRequired);
		failure.ImageIndex.Should().Be(2);
		failure.Cause.Should().Contain("image 2 has none");

		PublishValidationService.Validate("hi", ["image/png", "image/png"], [strict], null, ["a cat", "a dog"])
			.Should().BeNull();
		PublishValidationService.Validate(
			"hi", ["image/png", "image/png"], [ProviderCapabilityRegistry.Mastodon], null, alts
		).Should().BeNull("no shipped provider requires alt text");
	}

	// The enforcement fails closed: an absent or short alt-text list is missing alt text.
	[Fact]
	public void ItShouldTreatAnAbsentOrShortAltTextListAsMissingWhenTheCapabilityRequiresAltText() {
		var strict = ProviderCapabilityRegistry.Mastodon with { RequiresAltText = true };

		PublishValidationServiceSpec._Failure(PublishValidationService.Validate("hi", ["image/png"], [strict]))
			.Kind.Should().Be(PublishContentFailureKind.AltTextRequired);
		var short_ = PublishValidationServiceSpec._Failure(PublishValidationService.Validate(
			"hi", ["image/png", "image/png"], [strict], null, ["a cat"]
		));
		short_.Kind.Should().Be(PublishContentFailureKind.AltTextRequired);
		short_.ImageIndex.Should().Be(2);
	}

	// Limits come from the capability handed in, never from a literal in the validator:
	// a capability with other limits changes the verdict on the same text and images.
	[Fact]
	public void ItShouldReadEveryLimitFromTheCapabilityItIsGiven() {
		var tiny = ProviderCapabilityRegistry.Bluesky with {
			TextLimits = [new TextLimit(GraphemeCountingRule.Instance, 5)],
			MaxImages = 1,
		};

		PublishValidationServiceSpec._Failure(PublishValidationService.Validate("123456", [], [tiny]))
			.Kind.Should().Be(PublishContentFailureKind.TooLong);
		PublishValidationService.Validate("12345", [], [tiny]).Should().BeNull();
		PublishValidationServiceSpec._Failure(PublishValidationService.Validate("hi", ["image/png", "image/png"], [tiny]))
			.Kind.Should().Be(PublishContentFailureKind.TooManyImages);
		PublishValidationService.Validate("123456", [], [ProviderCapabilityRegistry.Bluesky]).Should().BeNull();
	}

	// #2184: an operator-disabled provider is refused at validation with its display name.
	[Fact]
	public void ItShouldRefuseADestinationWhoseProviderTheOperatorDisabled() {
		var account = new PublyApp.Api.Modules.SocialAccounts.Entities.SocialAccount {
			TenantId = Guid.NewGuid(),
			Id = Guid.NewGuid(),
			Provider = PublyApp.Api.Modules.SocialAccounts.Entities.SocialProvider.DiscordWebhook,
			ExternalAccountId = "hook",
			DisplayHandle = "#releases",
			ProtectedCredentials = "x",
		};
		var content = new EffectiveContent(["hello"], []);

		var failure = PublishValidationServiceSpec._Failure(
			PublishValidationService.ValidateDestination(content, account, _ => false)
		);

		failure.Kind.Should().Be(PublishContentFailureKind.ProviderDisabled);
		failure.Destination.Should().Be("#releases");
		failure.Cause.Should().Contain("Discord is disabled").And.NotContain("discord_webhook");
		PublishValidationService.ValidateDestination(content, account, _ => true).Should().BeNull();
		PublishValidationService.ValidateDestination(content, account).Should().BeNull();
	}
}
