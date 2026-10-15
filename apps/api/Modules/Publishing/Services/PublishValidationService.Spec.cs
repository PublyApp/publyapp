using FluentAssertions;

using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

public sealed class PublishValidationServiceSpec {
	private const string _Family =
		"\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466";

	private static PublishContentFailure? _Validate(string body, bool hasMedia = false) {
		return PublishValidationService.Validate(body, hasMedia, [SocialProvider.Bluesky]);
	}

	[Fact]
	public void ItShouldAccept300GraphemesAndRejectThe301st() {
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
	public void ItShouldCapTheSameTextAt3000Bytes() {
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

		PublishValidationServiceSpec._Validate("  \n ", hasMedia: true).Should().BeNull();
	}
}
