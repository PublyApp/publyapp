using System.Globalization;

namespace PublyApp.Api.Modules.Publishing.Lib;

/// <summary>
/// Wire ⇄ storage conversion for the schedule pair (D3 Task 4). The stored side
/// is the UTC instant + IANA zone; the wire side adds the zone-local ISO string
/// so screens can show what the operator picked without re-implementing tz math.
/// </summary>
public static class PublicationZoneFormatter {
	/// <summary>
	/// Formats the stored UTC instant as an ISO-8601 string WITH OFFSET in the
	/// given IANA zone (DST-aware: summer/winter produce different offsets).
	/// </summary>
	public static string ToLocalIso(DateTime utcInstant, string timeZoneId) {
		var zone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
		var local = TimeZoneInfo.ConvertTime(
			new DateTimeOffset(
				DateTime.SpecifyKind(utcInstant, DateTimeKind.Utc)
			),
			zone
		);
		return local.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture);
	}

	public static bool IsKnownZone(string timeZoneId) {
		return TimeZoneInfo.TryFindSystemTimeZoneById(timeZoneId, out _);
	}
}
