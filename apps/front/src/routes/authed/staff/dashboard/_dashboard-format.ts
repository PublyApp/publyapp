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
 * year at the end). Pure functions, locale-driven; no hardcoded copy. */
const dayMonth = (locale: string): Intl.DateTimeFormat =>
	new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
const dayMonthYear = (locale: string): Intl.DateTimeFormat =>
	new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
export const formatPeriodRange = (
	start: Date | string,
	locale: string,
): string =>
	`${dayMonth(locale).format(new Date(start))} – ${dayMonthYear(locale).format(new Date())}`;
