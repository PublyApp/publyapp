using System.Globalization;

using FluentValidation;

namespace PublyApp.Api.Modules.Dashboard.Validation;

/// <summary>
/// Wire rules shared by the staff dashboard reads. A window is a pair of
/// inclusive UTC calendar days, and its span may not exceed 366 elapsed days
/// (one year plus the leap-day allowance), so the 12-month dashboard preset
/// always fits — including the year that contains 29 February.
/// </summary>
public static class DashboardQueryRules {
	public const int MaxWindowDays = 366;
	public const int DefaultTopOrganisationsSize = 5;
	public const int MaxTopOrganisationsSize = 20;

	public static bool BeValidDate(string? value) {
		if (string.IsNullOrWhiteSpace(value)) {
			return false;
		}

		return DateTime.TryParse(
			value,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out _
		);
	}

	/// <summary>
	/// Parses both wire dates and normalises them to the UTC calendar day they
	/// name. A bare <c>YYYY-MM-DD</c> is already a UTC day; a qualified
	/// timestamp (the front sends <c>T23:59:59</c> for an inclusive end) is
	/// converted to UTC first, so an offset never shifts the day it belongs to.
	/// </summary>
	public static bool TryParseWindow(
		string? startDate,
		string? endDate,
		out DateTime start,
		out DateTime end
	) {
		start = default;
		end = default;

		if (!DashboardQueryRules.BeValidDate(startDate)
			|| !DashboardQueryRules.BeValidDate(endDate)
		) {
			return false;
		}

		_ = DateTime.TryParse(
			startDate,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out var parsedStart
		);
		_ = DateTime.TryParse(
			endDate,
			CultureInfo.InvariantCulture,
			DateTimeStyles.RoundtripKind,
			out var parsedEnd
		);

		start = DashboardQueryRules.ToUtcDay(parsedStart);
		end = DashboardQueryRules.ToUtcDay(parsedEnd);
		return true;
	}

	public static DateTime ToUtcDay(DateTime parsed) {
		return parsed.Kind switch {
			DateTimeKind.Utc => parsed.Date,
			DateTimeKind.Local => parsed.ToUniversalTime().Date,
			DateTimeKind.Unspecified => DateTime.SpecifyKind(
				parsed.Date,
				DateTimeKind.Utc
			),
			_ => DateTime.SpecifyKind(
				parsed.Date,
				DateTimeKind.Utc
			),
		};
	}

	public static int DaySpan(DateTime start, DateTime end) {
		return (end - start).Days;
	}

	public static bool BeValidSize(string? value) {
		if (string.IsNullOrWhiteSpace(value)) {
			return true;
		}

		return int.TryParse(value, out var size)
			&& size >= 1
			&& size <= DashboardQueryRules.MaxTopOrganisationsSize;
	}
}

public interface IDashboardWindowQuery {
	string? StartDate { get; }
	string? EndDate { get; }
}

/// <summary>
/// The start/end validation both dashboard reads share, so their 422 keys and
/// messages cannot drift apart. Mirrors <c>CursorPaginatedQueryValidator&lt;T&gt;</c>.
/// </summary>
public class DashboardWindowQueryValidator<T>
	: AbstractValidator<T> where T : IDashboardWindowQuery {
	public DashboardWindowQueryValidator() {
		this.RuleFor(x => x.StartDate)
			.Cascade(CascadeMode.Stop)
			.NotEmpty()
			.WithMessage("start_date is required")
			.Must(DashboardQueryRules.BeValidDate)
			.WithMessage(
				"start_date must be a valid ISO 8601 date"
			);

		this.RuleFor(x => x.EndDate)
			.Cascade(CascadeMode.Stop)
			.NotEmpty()
			.WithMessage("end_date is required")
			.Must(DashboardQueryRules.BeValidDate)
			.WithMessage(
				"end_date must be a valid ISO 8601 date"
			);

		this.RuleFor(x => x)
			.Custom((query, context) => {
				if (!DashboardQueryRules.TryParseWindow(
					query.StartDate,
					query.EndDate,
					out var start,
					out var end
				)) {
					// The individual date rules already reported
					// the malformed value; a range failure would
					// only duplicate it.
					return;
				}

				if (start > end) {
					context.AddFailure(
						"start_date",
						"start_date must be before or equal"
						+ " to end_date"
					);
					return;
				}

				if (DashboardQueryRules.DaySpan(start, end)
					> DashboardQueryRules.MaxWindowDays
				) {
					context.AddFailure(
						"end_date",
						"end_date must be within "
						+ $"{DashboardQueryRules.MaxWindowDays} days"
						+ " of start_date"
					);
				}
			});
	}
}
