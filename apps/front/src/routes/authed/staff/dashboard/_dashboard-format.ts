/**
 * The number formatting every dashboard card shares, and the unknown-value
 * convention. Pure functions, no JSX — a component file may only export
 * components (react-doctor `only-export-components`). Query state rendering
 * belongs to `QueryDisplay`, never to a dashboard-local ladder.
 */

/** The unknown-value convention: a figure the API cannot source is « — ». */
export const UNKNOWN_VALUE = '—';

export const formatCount = (value: number, locale: string): string =>
	new Intl.NumberFormat(locale).format(value);

/** A share of a total; « — » when the total is 0 (a 0-of-0 share is not 0 %). */
export const formatShare = (
	value: number,
	total: number,
	locale: string,
): string =>
	total <= 0
		? UNKNOWN_VALUE
		: new Intl.NumberFormat(locale, {
				style: 'percent',
				maximumFractionDigits: 1,
			}).format(value / total);

/** « 22 sept. – 21 oct. 2026 » — the report period's resolved range, the way
 * the prototype's select shows it (day-month for the start, with the shared
 * year at the end). Both days are calendar days (`YYYY-MM-DD`) and are
 * formatted in UTC, like the charts: formatting a date-only string in the
 * viewer's zone would print the day before west of UTC (A-1). */
const dayMonth = (locale: string): Intl.DateTimeFormat =>
	new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	});
const dayMonthYear = (locale: string): Intl.DateTimeFormat =>
	new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});
export const formatPeriodRange = (
	start: string,
	end: string,
	locale: string,
): string =>
	`${dayMonth(locale).format(new Date(`${start}T00:00:00Z`))} – ${dayMonthYear(locale).format(new Date(`${end}T00:00:00Z`))}`;

/** The sum of a dashboard series. `undefined` when the API served no point
 * at all — an empty window is unknown, not a real 0. */
export const seriesTotal = (
	points: ReadonlyArray<{ value?: number | null }> | null | undefined,
): number | undefined => {
	if (!points || points.length === 0) {
		return undefined;
	}
	let total = 0;
	for (const point of points) {
		total += point.value ?? 0;
	}
	return total;
};
