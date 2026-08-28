using FluentAssertions;

using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Handlers.Tenant;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

// Round-trip pin: PublicationStatusCsv maps BACK exactly what
// PublicationWire.FormatStatus writes — one source of truth for the wire
// vocabulary (plan D2 Task 3).
public sealed class PublicationStatusCsvSpec {
	[Fact]
	public void ItShouldRoundTripEveryEnumValueThroughTheFormatter() {
		foreach (PublicationStatus value in Enum.GetValues<PublicationStatus>()) {
			var wire = PublicationWire.FormatStatus(value);
			var parsed = PublicationStatusCsv.Parse(wire);

			parsed.Should().NotBeNull($"'{wire}' is a formatter-emitted token");
			Assert.NotNull(parsed);
			parsed.Should().ContainSingle()
				.Which.Should().Be(value);
			PublicationStatusCsv.GetValidationError(wire)
				.Should().BeNull($"'{wire}' is a valid token");
		}
	}

	[Fact]
	public void ItShouldTreatNullWhitespaceAndBogusTokensCorrectly() {
		PublicationStatusCsv.Parse(null).Should().BeNull();
		PublicationStatusCsv.Parse("").Should().BeNull();
		PublicationStatusCsv.Parse("   ").Should().BeNull();

		PublicationStatusCsv.Parse("bogus").Should().NotBeNull(
			"Parse returns tokens; validation is GetValidationError's job"
		);
		PublicationStatusCsv.GetValidationError("bogus")
			.Should().NotBeNull();
		PublicationStatusCsv.GetValidationError(null).Should().BeNull();
		PublicationStatusCsv.GetValidationError("")
			.Should().BeNull("empty means unfiltered, not invalid");

		PublicationStatusCsv.Parse("published,in_progress")
			.Should().BeEquivalentTo([
				PublicationStatus.Published,
				PublicationStatus.InProgress,
			]);
		PublicationStatusCsv.Parse(" published , failed ")
			.Should().BeEquivalentTo([
				PublicationStatus.Published,
				PublicationStatus.Failed,
			]);
	}
}
