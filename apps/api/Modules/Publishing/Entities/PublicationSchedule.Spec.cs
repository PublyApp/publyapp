using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Entities;

public sealed class PublicationScheduleSpec {
	[Fact]
	public void ItShouldAcceptARealIanaZoneAndNormaliseToUtcKind() {
		var instant = new DateTime(2026, 9, 1, 8, 0, 0, DateTimeKind.Utc);

		var schedule = PublicationSchedule.Create(
			instant,
			"America/Argentina/Buenos_Aires"
		);

		schedule.ScheduledAtUtc.Should().Be(instant);
		schedule.ScheduledAtUtc.Kind.Should().Be(DateTimeKind.Utc);
		schedule.ScheduledTimeZone.Should().Be("America/Argentina/Buenos_Aires");
	}

	[Fact]
	public void ItShouldAcceptUtcAsAZone() {
		var schedule = PublicationSchedule.Create(
			new DateTime(2026, 9, 1, 8, 0, 0, DateTimeKind.Utc),
			"Etc/UTC"
		);

		schedule.ScheduledTimeZone.Should().Be("Etc/UTC");
	}

	[Fact]
	public void ItShouldRejectALocalKindInstant() {
		var local = new DateTime(2026, 9, 1, 8, 0, 0, DateTimeKind.Local);

		var act = () => PublicationSchedule.Create(local, "Europe/Paris");

		act.Should().Throw<ArgumentException>().WithParameterName("scheduledAtUtc");
	}

	[Fact]
	public void ItShouldRejectAnEmptyOrNullZone() {
		var instant = new DateTime(2026, 9, 1, 8, 0, 0, DateTimeKind.Utc);

		var actEmpty = () => PublicationSchedule.Create(instant, "");
		var actSpaces = () => PublicationSchedule.Create(instant, "   ");

		actEmpty.Should().Throw<ArgumentException>().WithParameterName("timeZoneId");
		actSpaces.Should().Throw<ArgumentException>().WithParameterName("timeZoneId");
	}

	[Fact]
	public void ItShouldRejectAnUnknownZone() {
		var instant = new DateTime(2026, 9, 1, 8, 0, 0, DateTimeKind.Utc);

		var act = () => PublicationSchedule.Create(instant, "Mars/Olympus_Mons");

		act.Should().Throw<ArgumentException>().WithParameterName("timeZoneId");
	}

	[Fact]
	public void ItShouldRejectAZoneLongerThanTheColumnBound() {
		var instant = new DateTime(2026, 9, 1, 8, 0, 0, DateTimeKind.Utc);
		var tooLong = new string('a', PublicationSchedule.MaxTimeZoneLength + 1);

		var act = () => PublicationSchedule.Create(instant, tooLong);

		act.Should().Throw<ArgumentException>().WithParameterName("timeZoneId");
	}
}
