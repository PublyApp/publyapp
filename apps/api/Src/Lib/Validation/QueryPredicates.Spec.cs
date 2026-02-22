using FluentAssertions;

using Xunit;

namespace MainApi.Src.Lib.Validation {
	public sealed class QueryPredicatesSpec {
		// ============== BeValidNullableGuid ==============

		[Theory]
		[InlineData(
			"550e8400-e29b-41d4-a716-446655440000", true
		)]
		[InlineData("invalid-guid", false)]
		[InlineData("", false)]
		[InlineData(null, true)]
		public void ItShouldValidateNullableGuidWhenGivenInput(
			string? value, bool expected
		) {
			bool result = QueryPredicates
				.BeValidNullableGuid(value);
			_ = result.Should().Be(expected);
		}

		// ============== BeValidNullableDate ==============

		[Theory]
		[InlineData("2026-02-22T10:00:00Z", true)]
		[InlineData("2026-02-22T10:00:00+02:00", true)]
		[InlineData("invalid-date", false)]
		[InlineData("", false)]
		[InlineData(null, true)]
		public void ItShouldValidateNullableDateWhenGivenInput(
			string? value, bool expected
		) {
			bool result = QueryPredicates
				.BeValidNullableDate(value);
			_ = result.Should().Be(expected);
		}

		// ============== BeValidDateRange ==============

		[Fact]
		public void ItShouldPassDateRangeWhenStartLessThanEnd() {
			bool result = QueryPredicates.BeValidDateRange(
				"2026-02-01T00:00:00Z",
				"2026-02-28T00:00:00Z"
			);
			_ = result.Should().BeTrue();
		}

		[Fact]
		public void ItShouldFailDateRangeWhenStartGreaterThanEnd() {
			bool result = QueryPredicates.BeValidDateRange(
				"2026-02-28T00:00:00Z",
				"2026-02-01T00:00:00Z"
			);
			_ = result.Should().BeFalse();
		}

		[Fact]
		public void ItShouldPassDateRangeWhenBothNull() {
			bool result = QueryPredicates
				.BeValidDateRange(null, null);
			_ = result.Should().BeTrue();
		}

		[Fact]
		public void ItShouldPassDateRangeWhenOnlyStartNull() {
			bool result = QueryPredicates.BeValidDateRange(
				null,
				"2026-02-28T00:00:00Z"
			);
			_ = result.Should().BeTrue();
		}

		[Fact]
		public void ItShouldPassDateRangeWhenOnlyEndNull() {
			bool result = QueryPredicates.BeValidDateRange(
				"2026-02-01T00:00:00Z",
				null
			);
			_ = result.Should().BeTrue();
		}

		[Fact]
		public void ItShouldPassDateRangeWhenOneSideIsUnparsable() {
			bool result = QueryPredicates.BeValidDateRange(
				"invalid-date",
				"2026-02-28T00:00:00Z"
			);
			_ = result.Should().BeTrue();
		}

		// ============== ParseNullableGuid ==============

		[Fact]
		public void ItShouldParseGuidWhenValid() {
			string guid = "550e8400-e29b-41d4-a716-446655440000";
			Guid? result = QueryPredicates
				.ParseNullableGuid(guid);
			_ = result.Should().NotBeNull();
			_ = (result ?? Guid.Empty).ToString()
				.Should().Be(guid);
		}

		[Fact]
		public void ItShouldReturnNullGuidWhenInvalid() {
			Guid? result = QueryPredicates
				.ParseNullableGuid("invalid");
			_ = result.Should().BeNull();
		}

		[Fact]
		public void ItShouldReturnNullGuidWhenNull() {
			Guid? result = QueryPredicates
				.ParseNullableGuid(null);
			_ = result.Should().BeNull();
		}

		[Fact]
		public void ItShouldReturnNullGuidWhenEmpty() {
			Guid? result = QueryPredicates
				.ParseNullableGuid("");
			_ = result.Should().BeNull();
		}

		[Fact]
		public void ItShouldReturnNullGuidWhenWhitespace() {
			Guid? result = QueryPredicates
				.ParseNullableGuid("   ");
			_ = result.Should().BeNull();
		}

		// ============== ParseNullableDate ==============

		[Fact]
		public void ItShouldParseDateWhenValid() {
			DateTime? result = QueryPredicates.ParseNullableDate(
				"2026-02-22T10:00:00Z"
			);
			_ = result.Should().NotBeNull();
			_ = (result ?? DateTime.MinValue).Kind
				.Should().Be(DateTimeKind.Utc);
		}

		[Fact]
		public void ItShouldReturnNullDateWhenInvalid() {
			DateTime? result = QueryPredicates
				.ParseNullableDate("invalid");
			_ = result.Should().BeNull();
		}

		[Fact]
		public void ItShouldReturnNullDateWhenNull() {
			DateTime? result = QueryPredicates
				.ParseNullableDate(null);
			_ = result.Should().BeNull();
		}

		[Fact]
		public void ItShouldReturnNullDateWhenEmpty() {
			DateTime? result = QueryPredicates
				.ParseNullableDate("");
			_ = result.Should().BeNull();
		}

		[Fact]
		public void ItShouldReturnNullDateWhenWhitespace() {
			DateTime? result = QueryPredicates
				.ParseNullableDate("   ");
			_ = result.Should().BeNull();
		}
	}
}
