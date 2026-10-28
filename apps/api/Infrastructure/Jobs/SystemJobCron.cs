using Quartz;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// The single validity rule for a system job's Quartz cron expression, shared by the
/// staff cron update and the scheduler reconcile. Quartz 4's parser is more permissive
/// than 3.x's (it accepts @macros and silently ignores day-of-month when day-of-week is
/// also set), so the 3.x contract is pinned here on top of <see cref="CronExpression"/>.
/// </summary>
public static class SystemJobCron {
	public static bool IsValid(string? cron) {
		if (string.IsNullOrWhiteSpace(cron)) {
			return false;
		}

		var trimmed = cron.Trim();
		if (trimmed.StartsWith('@')) {
			return false;
		}

		var fields = trimmed.Split(
			(char[]?)null,
			StringSplitOptions.RemoveEmptyEntries
		);
		if (fields.Length < 6) {
			return false;
		}

		// Quartz requires exactly one of day-of-month (4th) / day-of-week (6th) to be '?'.
		if (fields[3] != "?" && fields[5] != "?") {
			return false;
		}

		return CronExpression.TryParse(trimmed, out _);
	}

	/// <summary>
	/// The canonical Quartz spelling of <paramref name="cron"/>, or null when it is not a
	/// valid system job cron. Quartz normalizes what it stores (trimmed, single-spaced),
	/// so stored text must be compared in this form, never raw.
	/// </summary>
	public static string? Canonicalize(string? cron) {
		if (!SystemJobCron.IsValid(cron) || cron is null) {
			return null;
		}

		return CronExpression.TryParse(cron.Trim(), out var parsed)
			? parsed.CronExpressionString
			: null;
	}
}
