namespace MainApi.Src.Lib.Utils;

using FluentAssertions;

using Xunit;

public sealed class DateUtilsSpec {
	[Theory]
	[InlineData("2026-02-12T10:00:00Z", true)]
	[InlineData("2026-02-12T10:00:00.0000000Z", true)]
	[InlineData("2026-02-12T10:00:00+00:00", true)]
	[InlineData("2026-02-12T10:00:00+02:00", true)]
	[InlineData("2026-02-12T10:00:00-05:00", true)]
	[InlineData("2026-02-12T10:00:00+0200", true)]
	[InlineData("2026-02-12T10:00:00.1234567Z", true)]
	[InlineData("2026-02-12T10:00:00.1234567+02:00", true)]
	[InlineData("2026-02-12T10:00:00", false)]
	[InlineData("2026-02-12T10:00:00z", false)]
	[InlineData("06/15/2026 10:00 AM", false)]
	[InlineData("15 Jun 2026 10:00", false)]
	[InlineData("2026-02-12", false)]
	[InlineData("not-a-date", false)]
	[InlineData("", false)]
	[InlineData(null, false)]
	public void ItShouldMatchFormatContract(
		string? raw, bool expected
	) {
		_ = DateUtils.TryParseIsoUtc(raw, out _)
			.Should().Be(expected);
	}

	[Fact]
	public void ItShouldConvertToUtc() {
		_ = DateUtils.TryParseIsoUtc(
			"2026-06-15T10:00:00+02:00", out DateTime utc
		);

		_ = utc.Kind.Should().Be(DateTimeKind.Utc);
		_ = utc.Hour.Should().Be(8);
	}
}
