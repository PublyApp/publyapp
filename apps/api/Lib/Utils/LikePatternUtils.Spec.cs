using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Utils;

public sealed class LikePatternUtilsSpec {
	[Theory]
	[InlineData("percent%", "percent\\%")]
	[InlineData("under_score", "under\\_score")]
	[InlineData(@"\", "\\\\")]
	[InlineData("100%_\\mixed", "100\\%\\_\\\\mixed")]
	[InlineData("", "")]
	public void ItShouldEscapeLikeWildcardsAndEscapes(
		string raw,
		string expected
	) {
		var escaped = LikePatternUtils.EscapeLikePattern(raw);

		escaped.Should().Be(expected);
	}
}
