using System.Globalization;

namespace MainApi.Src.Lib.Utils;

public static class DateUtils {
	private static readonly string[] IsoFormats = [
		"yyyy-MM-ddTHH:mm:ss'Z'",
		"yyyy-MM-ddTHH:mm:ss.FFFFFFF'Z'",
		"yyyy-MM-ddTHH:mm:sszzz",
		"yyyy-MM-ddTHH:mm:ss.FFFFFFFzzz",
	];

	public static bool TryParseIsoUtc(
		string? raw, out DateTime utc
	) {
		utc = default;
		if (string.IsNullOrWhiteSpace(raw)) {
			return false;
		}

		var ok = DateTimeOffset.TryParseExact(
			raw,
			IsoFormats,
			CultureInfo.InvariantCulture,
			DateTimeStyles.AssumeUniversal
				| DateTimeStyles.AdjustToUniversal,
			out var dto
		);

		if (!ok) {
			return false;
		}
		utc = dto.UtcDateTime;
		return true;
	}
}
