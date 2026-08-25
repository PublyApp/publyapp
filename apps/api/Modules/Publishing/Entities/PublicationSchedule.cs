using System.Text.RegularExpressions;

namespace PublyApp.Api.Modules.Publishing.Entities;

/// <summary>
/// The publication instant and the IANA zone it was authored in, kept together
/// because they are one decision (Epic D §2 decision 5): the exact instant is what
/// the scheduler claims on, the zone is what every screen shows. Immutable once the
/// row exists; editing a scheduled publication replaces the whole pair (D3).
/// </summary>
public sealed record PublicationSchedule {
	public DateTime ScheduledAtUtc { get; }

	public string ScheduledTimeZone { get; }

	// IANA zone identifier: segments of letters/digits/_/- joined by '/', e.g.
	// "America/Argentina/Buenos_Aires". Bounded to 64 chars by the column.
	private static readonly Regex ZonePattern = new(
		"^[A-Za-z0-9_+\\-]+(/[A-Za-z0-9_+\\-]+){0,4}$",
		RegexOptions.Compiled,
		matchTimeout: TimeSpan.FromSeconds(1)
	);

	private PublicationSchedule(DateTime scheduledAtUtc, string scheduledTimeZone) {
		ScheduledAtUtc = scheduledAtUtc;
		ScheduledTimeZone = scheduledTimeZone;
	}

	public static PublicationSchedule Create(DateTime scheduledAtUtc, string timeZoneId) {
		if (scheduledAtUtc.Kind is not (DateTimeKind.Utc or DateTimeKind.Unspecified)) {
			throw new ArgumentException(
				"The publication instant must be UTC (or unspecified, read as UTC).",
				nameof(scheduledAtUtc)
			);
		}

		if (string.IsNullOrWhiteSpace(timeZoneId)) {
			throw new ArgumentException(
				"A publication needs its IANA time zone.",
				nameof(timeZoneId)
			);
		}

		var trimmed = timeZoneId.Trim();
		if (trimmed.Length > MaxTimeZoneLength || !ZonePattern.IsMatch(trimmed)) {
			throw new ArgumentException(
				$"'{trimmed}' is not an IANA time zone identifier.",
				nameof(timeZoneId)
			);
		}

		try {
			TimeZoneInfo.FindSystemTimeZoneById(trimmed);
		} catch (TimeZoneNotFoundException) {
			throw new ArgumentException(
				$"'{trimmed}' is not an IANA time zone identifier.",
				nameof(timeZoneId)
			);
		} catch (InvalidTimeZoneException) {
			throw new ArgumentException(
				$"'{trimmed}' is not a usable time zone identifier.",
				nameof(timeZoneId)
			);
		}

		return new PublicationSchedule(
			DateTime.SpecifyKind(scheduledAtUtc, DateTimeKind.Utc),
			trimmed
		);
	}

	public const int MaxTimeZoneLength = 64;
}
