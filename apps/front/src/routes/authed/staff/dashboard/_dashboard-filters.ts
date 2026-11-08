/**
 * The dashboard's URL-backed filters (§5.2): the period preset, the
 * « Organisations » scope, and the start date a period stands for. Pure
 * functions, no JSX — a component file may only export components
 * (react-doctor `only-export-components`).
 */

/** The overview/report periods (§5.2), in the prototype's order. */
export type DashboardPeriod = '30d' | '7d' | '90d' | '12m';
export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = [
	'30d',
	'7d',
	'90d',
	'12m',
];

export type OrganisationScope = 'all' | 'active' | 'pending' | 'suspended';
export const ORGANISATION_SCOPES: readonly OrganisationScope[] = [
	'all',
	'active',
	'pending',
	'suspended',
];

/** The period presets, as the URL's `period` search param. Unknown values are
 * dropped, so a hand-edited URL falls back to the default. */
export const parseDashboardPeriod = (
	value: unknown,
): DashboardPeriod | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}
	const normalized = value.trim();
	return DASHBOARD_PERIODS.find((period) => period === normalized);
};

/** The « Organisations » scope, as the URL's `scope` search param. */
export const parseOrganisationScope = (
	value: unknown,
): OrganisationScope | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}
	const normalized = value.trim();
	return ORGANISATION_SCOPES.find((scope) => scope === normalized);
};

export const periodLabelKey = (period: DashboardPeriod): string =>
	`dashboard-period-${period}`;

export const organisationScopeLabelKey = (scope: OrganisationScope): string =>
	`dashboard-org-${scope}`;

/** Days in a preset, except `12m` which is 12 calendar months (N11). */
const PERIOD_DAYS = {
	'30d': 30,
	'7d': 7,
	'90d': 90,
} satisfies Record<Exclude<DashboardPeriod, '12m'>, number>;

/** `YYYY-MM-DD` for the API's `start_date` (the audit endpoints parse a bare
 * date as midnight, which is what a period start means). Built from the local
 * calendar date, never from `toISOString()` on a local instant: that shifts
 * the day by one east of UTC (N11). */
const isoLocalDay = (date: Date): string =>
	new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
		.toISOString()
		.slice(0, 10);

export const periodStart = (
	period: DashboardPeriod,
	now: Date = new Date(),
): string => {
	if (period === '12m') {
		return isoLocalDay(
			new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()),
		);
	}
	return isoLocalDay(
		new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() - PERIOD_DAYS[period],
		),
	);
};

/** `YYYY-MM-DD` for today, the inclusive end of a dashboard window. */
export const todayIso = (now: Date = new Date()): string => isoLocalDay(now);

/** Shift a `YYYY-MM-DD` day by `days`, in UTC so DST never moves it. */
export const addIsoDays = (iso: string, days: number): string =>
	new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
		.toISOString()
		.slice(0, 10);

/** The window just before the current one, same length: the delta's
 * comparison base. */
export const previousPeriod = (
	period: DashboardPeriod,
	now: Date = new Date(),
) => {
	const startDate = periodStart(period, now);
	const endDate = addIsoDays(startDate, -1);
	const length =
		Math.round(
			(Date.parse(todayIso(now)) - Date.parse(startDate)) / 86_400_000,
		) + 1;
	return { startDate: addIsoDays(endDate, -(length - 1)), endDate };
};

/** The heatmap's window: one year, the API's maximum span. */
export const heatmapWindow = (now: Date = new Date()) => ({
	startDate: addIsoDays(todayIso(now), -364),
	endDate: todayIso(now),
});
