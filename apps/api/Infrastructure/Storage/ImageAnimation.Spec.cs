using FluentAssertions;

using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Infrastructure.Storage;

public sealed class ImageAnimationSpec {
	private static readonly byte[] _TwoFrames = [0, 0, 0, 2, 0, 0, 0, 0];

	private static bool _IsAnimated(byte[] png) {
		return ImageAnimation.IsAnimatedPng(new MemoryStream(png));
	}

	[Fact]
	public void ItShouldCallAPngWithAnAnimationChunkBeforeItsImageDataAnimated() {
		var apng = TestImages.WithChunk(TestImages.Png(8, 8), "acTL", ImageAnimationSpec._TwoFrames);

		ImageAnimationSpec._IsAnimated(apng).Should().BeTrue();
	}

	[Fact]
	public void ItShouldNotCallAPlainPngAnimated() {
		ImageAnimationSpec._IsAnimated(TestImages.Png(8, 8)).Should().BeFalse();
	}

	[Fact]
	public void ItShouldNotCallAPngWithAZeroFrameAnimationChunkAnimated() {
		var png = TestImages.WithChunk(
			TestImages.Png(8, 8), "acTL", [0, 0, 0, 0, 0, 0, 0, 0]
		);

		ImageAnimationSpec._IsAnimated(png).Should().BeFalse();
	}

	[Fact]
	public void ItShouldNotCallAPngAnimatedWhenTheAnimationChunkComesAfterTheImageData() {
		var png = TestImages.WithChunk(
			TestImages.Png(8, 8), "acTL", ImageAnimationSpec._TwoFrames, afterImageData: true
		);

		ImageAnimationSpec._IsAnimated(png).Should().BeFalse();
	}

	[Fact]
	public void ItShouldSkipAMalformedAnimationChunkAndKeepWalkingToAValidOne() {
		var stray = TestImages.WithChunk(TestImages.Png(8, 8), "acTL", [0, 0, 0, 2]);
		var png = TestImages.WithChunk(stray, "acTL", ImageAnimationSpec._TwoFrames);

		ImageAnimationSpec._IsAnimated(png).Should().BeTrue();
	}

	[Fact]
	public void ItShouldNeverThrowOnATruncatedFile() {
		var apng = TestImages.WithChunk(TestImages.Png(8, 8), "acTL", ImageAnimationSpec._TwoFrames);

		ImageAnimationSpec._IsAnimated(apng[..40]).Should().BeFalse();
	}
}
