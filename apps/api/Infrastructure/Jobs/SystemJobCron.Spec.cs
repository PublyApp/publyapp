using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

public sealed class SystemJobCronSpec {
	[Theory]
	[InlineData("@daily")]
	[InlineData("@hourly")]
	[InlineData("  @weekly")]
	[InlineData("0 0 3 * * MON-FRI")]
	[InlineData("0 0 3 * * *")]
	[InlineData("0 0 3 1 * MON")]
	[InlineData("0 3 * * *")]
	[InlineData("")]
	[InlineData("   ")]
	[InlineData("definitely-not-a-cron")]
	public void ItShouldRejectCronsTheThreeDotXParserRejected(string cron) {
		SystemJobCron.IsValid(cron).Should().BeFalse();
	}

	[Theory]
	[InlineData("0 0 3 * * ?")]
	[InlineData("0 0/5 * * * ?")]
	[InlineData("0 0 3 ? * MON-FRI")]
	[InlineData("  0 0 3 * * ?  ")]
	public void ItShouldAcceptANormalQuartzCron(string cron) {
		SystemJobCron.IsValid(cron).Should().BeTrue();
	}

	[Fact]
	public void ItShouldCanonicalizeSurroundingWhitespaceToTheTrimmedExpression() {
		SystemJobCron.Canonicalize("  0 0 3 * * ? ").Should().Be(
			SystemJobCron.Canonicalize("0 0 3 * * ?")
		);
		SystemJobCron.Canonicalize("@daily").Should().BeNull();
	}
}
