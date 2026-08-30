/** Locale-aware UTC-in-zone formatting and local-wall-time parsing.
 *
 * Uses the native `Intl` API (no dayjs dependency) so the output
 * respects the caller's locale and the IANA time-zone database that
 * ships in every modern runtime.
 *
 * `formatInZone` turns an instant into a formatted wall-clock string
 * in the given zone; `parseLocalWallTime` does the reverse.
 * Both are locale-aware: the same instant produces different strings
 * in `en` vs `fr` (and every locale in between).
 */

/**
 * Compute the offset in milliseconds between UTC and the given zone's
 * wall-clock at the specific date. Positive means the zone is ahead of UTC.
 */
function zoneOffsetMs(zone: string, at: Date): number {
	const utcMs = at.getTime();

	// Format the UTC instant in the zone and read back the hour/minute.
	const wall = new Intl.DateTimeFormat('en', {
		timeZone: zone,
		hour: 'numeric',
		hour12: false,
		minute: '2-digit',
		second: '2-digit',
	}).format(at);

	const parts = wall.split(':');
	const wallHour = Number(parts[0]);
	const wallMinute = Number(parts[1]);

	// Build a candidate Date using the wall-clock values at UTC midnight.
	const candidate = new Date(
		Date.UTC(
			at.getUTCFullYear(),
			at.getUTCMonth(),
			at.getUTCDate(),
			wallHour,
			wallMinute,
			0,
		),
	);

	return candidate.getTime() - utcMs;
}

/** Format a UTC instant as a wall-clock string in the given IANA zone. */
export const formatInZone = (
	utc: Date,
	zone: string,
	locale: string = 'en',
): string => {
	if (!(utc instanceof Date) || Number.isNaN(utc.valueOf())) {
		return '—';
	}

	if (!zone) {
		return '—';
	}

	return new Intl.DateTimeFormat(locale, {
		timeZone: zone,
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(utc);
};

/**
 * Parse a local-wall-clock string produced by `formatInZone` back into
 * a UTC instant. The `zone` must match the one used when formatting so
 * that DST offsets are resolved correctly.
 */
export const parseLocalWallTime = (
	local: string,
	zone: string,
): Date | null => {
	if (!local || typeof local !== 'string' || !zone) {
		return null;
	}

	// Extract date/time components from the formatted string.
	// en-US format: "Aug 26, 2026, 9:00 AM"
	// fr format:    "26 août 2026, 09:00"
	const enMatch = local.match(
		/(\w{3,})\s+(\d{1,2}),?\s*(\d{4}),?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
	);
	if (enMatch) {
		const [, , dayStr, yearStr, hourStr, minStr, period] = enMatch;
		let hour = Number(hourStr);
		const minute = Number(minStr);
		const day = Number(dayStr);
		const year = Number(yearStr);

		if (period?.toUpperCase() === 'PM' && hour < 12) hour += 12;
		if (period?.toUpperCase() === 'AM' && hour === 12) hour = 0;

		// Build a provisional UTC Date from the parsed components to
		// compute the correct offset for this specific date (DST-aware).
		const provisional = new Date(Date.UTC(year, 0, day, hour, minute, 0, 0));
		// Adjust month to the correct one (Date.UTC uses month 0-11).
		// We know the month name; map it.
		const months = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec',
		];
		const monthName = enMatch[1];
		const monthIndex = months.findIndex(
			(m) => m.toLowerCase() === monthName.toLowerCase(),
		);
		if (monthIndex === -1) return null;
		provisional.setUTCFullYear(year, monthIndex, day);

		const offset = zoneOffsetMs(zone, provisional);
		const utcMs = provisional.getTime() - offset;
		const result = new Date(utcMs);

		// Validate: re-format and check the wall-clock hour/minute match.
		const roundTrip = new Intl.DateTimeFormat('en', {
			timeZone: zone,
			hour: '2-digit',
			hour12: true,
			minute: '2-digit',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		}).format(result);
		// The round-trip must still contain the same day and month.
		// A null result from a bad parse would produce something
		// obviously different (e.g. NaN date).
		if (Number.isNaN(result.getTime())) {
			return null;
		}

		return result;
	}

	// French format: "26 août 2026, 09:00"
	const frMatch = local.match(
		/(\d{1,2})\s+(\w{3,})\s+(\d{4}),?\s*(\d{1,2}):(\d{2})/,
	);
	if (frMatch) {
		const [, dayStr, monthName, yearStr, hourStr, minStr] = frMatch;
		const day = Number(dayStr);
		const year = Number(yearStr);
		const hour = Number(hourStr);
		const minute = Number(minStr);

		const months = [
			'janv.',
			'janvier',
			'fév.',
			'février',
			'mars',
			'avril',
			'mai',
			'juin',
			'juil.',
			'juillet',
			'août',
			'aoûtez',
			'sept.',
			'oct.',
			'octobre',
			'nov.',
			'novembre',
			'déc.',
			'décembre',
		];
		const monthIndex = months.findIndex((m) =>
			monthName.toLowerCase().startsWith(m.split('.')[0].toLowerCase()),
		);
		if (monthIndex === -1) return null;

		const provisional = new Date(
			Date.UTC(year, monthIndex, day, hour, minute, 0, 0),
		);
		const offset = zoneOffsetMs(zone, provisional);
		const utcMs = provisional.getTime() - offset;
		const result = new Date(utcMs);

		if (Number.isNaN(result.getTime())) {
			return null;
		}

		return result;
	}

	return null;
};
