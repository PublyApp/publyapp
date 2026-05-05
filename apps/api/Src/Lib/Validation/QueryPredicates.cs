using System.Globalization;

namespace MainApi.Src.Lib.Validation;

/// <summary>
/// Query parameter validation and parsing utilities.
///
/// This class serves two concerns (as a pragmatic trade-off):
/// - VALIDATION predicates (BeValid*) used in FluentValidation rules
/// - PARSING predicates (Parse*) pure functions for data transformation
///
/// Both are related to date/GUID query parameter handling and kept together
/// for cohesion. If strict SRP enforcement is required, these can be split
/// into separate files (QueryValidationPredicates, QueryParsingFunctions).
/// </summary>
public static class QueryPredicates {
	public static bool BeValidNullableGuid(
		string? value
	) {
		if (value is null) {
			return true;
		}
		return Guid.TryParse(value, out _);
	}

	public static bool BeValidNullableDate(
		string? value
	) {
		if (value is null) {
			return true;
		}
		return DateTime.TryParse(
			value,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out _
		);
	}

	public static bool BeValidDateRange(
		string? startDate,
		string? endDate
	) {
		if (startDate is null || endDate is null) {
			return true;
		}

		var startParsed = DateTime.TryParse(
			startDate,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out var start
		);
		var endParsed = DateTime.TryParse(
			endDate,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out var end
		);

		if (!startParsed || !endParsed) {
			return true;
		}

		return start <= end;
	}

	public static Guid? ParseNullableGuid(
		string? value
	) {
		if (value is not null
			&& Guid.TryParse(value, out var parsed)
		) {
			return parsed;
		}
		return null;
	}

	public static DateTime? ParseNullableDate(
		string? value
	) {
		if (value is not null
			&& DateTime.TryParse(
				value,
				CultureInfo.InvariantCulture,
				DateTimeStyles.RoundtripKind,
				out var parsed
			)
		) {
			return parsed;
		}
		return null;
	}
}
