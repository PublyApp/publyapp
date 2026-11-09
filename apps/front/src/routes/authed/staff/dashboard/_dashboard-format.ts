/**
 * The number formatting every dashboard card shares, and the unknown-value
 * convention. Pure functions, no JSX — a component file may only export
 * components (react-doctor `only-export-components`). Query state rendering
 * belongs to `QueryDisplay`, never to a dashboard-local ladder.
 */

import { formatDayMonth, formatShortDate } from '~/utils/format-time';

/** The unknown-value convention: a figure the API cannot source is « — ». */
export const UNKNOWN_VALUE = '—';

/** Building an `Intl.NumberFormat` is slow and the locale changes at runtime,
 * so keep one per (locale, options) pair instead of one per render. */
const numberFormatters = new Map<string, Intl.NumberFormat>();

const numberFormat = (
	locale: string,
	options: Intl.NumberFormatOptions,
): Intl.NumberFormat => {
	const key = `${locale}:${JSON.stringify(options)}`;
	const cached = numberFormatters.get(key);
	if (cached) {
		return cached;
	}
	const formatter = new Intl.NumberFormat(locale, options);
	numberFormatters.set(key, formatter);
	return formatter;
};

export const formatCount = (value: number, locale: string): string =>
	numberFormat(locale, {}).format(value);

/** A share of a total; « — » when the total is 0 (a 0-of-0 share is not 0 %). */
export const formatShare = (
	value: number,
	total: number,
	locale: string,
): string =>
	total <= 0
		? UNKNOWN_VALUE
		: numberFormat(locale, {
				style: 'percent',
				maximumFractionDigits: 1,
			}).format(value / total);

/** « +12,5 % » — the KPI delta, always signed. */
export const formatSignedPercent = (value: number, locale: string): string =>
	numberFormat(locale, {
		style: 'percent',
		maximumFractionDigits: 1,
		signDisplay: 'always',
	}).format(value);

/** « 33,3 % » — a segment's share in the report table, exactly one decimal. */
export const formatPercentOneDecimal = (
	value: number,
	locale: string,
): string =>
	numberFormat(locale, {
		style: 'percent',
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(value);

/** « 22 sept. – 21 oct. 2026 » — the report period's resolved range, the way
 * the prototype's select shows it (day-month for the start, with the shared
 * year at the end). Both days are calendar days (`YYYY-MM-DD`) and are
 * formatted in UTC, like the charts: formatting a date-only string in the
 * viewer's zone would print the day before west of UTC (A-1). */
export const formatPeriodRange = (
	start: string,
	end: string,
	locale: string,
): string =>
	`${formatDayMonth(new Date(`${start}T00:00:00Z`), locale)} – ${formatShortDate(new Date(`${end}T00:00:00Z`), locale, { timeZone: 'UTC' })}`;

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

/** The API's daily points as the shared charts' labelled series. */
export const toSeriesPoints = (
	points:
		| ReadonlyArray<{ date?: string | null; value?: number | null }>
		| null
		| undefined,
	locale: string,
): { label: string; value: number }[] =>
	(points ?? []).map((point) => ({
		label: formatDayMonth(new Date(`${point.date ?? ''}T12:00:00Z`), locale),
		value: point.value ?? 0,
	}));
