import {
	IconChartBar,
	IconChartPie,
	IconFileSearch,
	IconKey,
	IconLogin2,
	IconMask,
	IconTrendingUp,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { historyCategory } from '~/components/history/history-actions';
import { StateSurface } from '~/components/ui/state-surface';
import { useStaffAuditLogsQuery } from '~/lib/query/staff-audit-logs';
import {
	useStaffDashboardSeriesQuery,
	useStaffDashboardTopOrganisationsQuery,
} from '~/lib/query/staff-dashboard';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	GhostAxis,
	GhostBars,
	GhostHBars,
	GhostLine,
	GhostStacked,
} from './_chart-ghost';
import {
	ChartTable,
	ColumnChart,
	HorizontalBars,
	StackedShareBar,
	type DonutSegment,
} from './_dashboard-charts';
import { DashboardExportMenu } from './_dashboard-export-menu';
import {
	dashboardWindow,
	parseDashboardPeriod,
	periodLabelKey,
	previousPeriod,
	previousPeriodLabelKey,
	type DashboardPeriod,
} from './_dashboard-filters';
import { UNKNOWN_VALUE, formatCount, seriesTotal } from './_dashboard-format';
import { ChartCard, KpiCard, PeriodSelect } from './_dashboard-ui';

/** The prototype's five « Répartition par type » buckets, in its order. */
const TYPE_BUCKETS = [
	{
		key: 'organisation',
		labelKey: 'dashboard-type-organisation',
		color: 'var(--publy-chart-seq-4)',
	},
	{
		key: 'auth',
		labelKey: 'dashboard-type-auth',
		color: 'var(--publy-chart-seq-3)',
	},
	{
		key: 'user',
		labelKey: 'dashboard-type-user',
		color: 'var(--publy-chart-seq-2)',
	},
	{
		key: 'invitation',
		labelKey: 'dashboard-type-invitation',
		color: 'var(--publy-chart-1)',
	},
	{
		key: 'other',
		labelKey: 'dashboard-type-other',
		color: 'var(--publy-chart-seq-1)',
	},
] as const;

/** The history's category → the report's five buckets. */
const typeBucket = (action: string): string => {
	const category = historyCategory(action);
	if (category === 'tenant') {
		return 'organisation';
	}
	if (category === 'auth') {
		return 'auth';
	}
	if (category === 'member') {
		return 'user';
	}
	if (category === 'invitation') {
		return 'invitation';
	}
	return 'other';
};

const Reports = () => {
	const { t, i18n } = useTranslation('common');
	const locale = i18n.language;
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const period: DashboardPeriod = search.period ?? '30d';
	// The same window the overview's cards read (B MA-1).
	const { startDate, endDate } = dashboardWindow(period);
	const [shouldLogout, setShouldLogout] = useState(false);

	const auditQuery = useStaffAuditLogsQuery({ size: 1, startDate, endDate });
	// `impersonation.started` is emitted by the impersonation service, so this
	// figure is real. The two sign-in actions exist only as constants in the
	// backend and are never written, so they have no query at all (B1).
	const impersonationsQuery = useStaffAuditLogsQuery({
		size: 1,
		startDate,
		endDate,
		actions: ['impersonation.started'],
	});

	const seriesQuery = useStaffDashboardSeriesQuery({
		metric: 'audit_events',
		startDate,
		endDate,
	});
	const previousSeriesQuery = useStaffDashboardSeriesQuery({
		metric: 'audit_events',
		...previousPeriod(period),
	});
	const topOrganisationsQuery = useStaffDashboardTopOrganisationsQuery({
		startDate,
		endDate,
		size: 5,
	});

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	for (const queryError of [
		auditQuery.error,
		impersonationsQuery.error,
		seriesQuery.error,
		previousSeriesQuery.error,
		topOrganisationsQuery.error,
	]) {
		if (queryError !== null && shouldLogoutForFailure(queryError)) {
			return <LogoutRedirect />;
		}
	}

	const currentTotal = seriesTotal(seriesQuery.data?.points);
	const previousTotal = seriesTotal(previousSeriesQuery.data?.points);
	// One « Événements d'audit » source for both screens: the series total,
	// falling back to the audit list's exact total when the series is empty.
	const auditEvents = currentTotal ?? auditQuery.data?.totalCount;
	const auditDelta =
		currentTotal !== undefined &&
		previousTotal !== undefined &&
		previousTotal > 0
			? {
					label: new Intl.NumberFormat(locale, {
						style: 'percent',
						maximumFractionDigits: 1,
						signDisplay: 'always',
					}).format((currentTotal - previousTotal) / previousTotal),
					direction:
						currentTotal >= previousTotal ? ('up' as const) : ('down' as const),
				}
			: undefined;
	const deltaPeriod = t('dashboard-delta-vs-previous', {
		period: t(previousPeriodLabelKey(period)),
	});

	const seriesPoints = (seriesQuery.data?.points ?? []).map((point) => ({
		label: new Intl.DateTimeFormat(locale, {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC',
		}).format(new Date(`${point.date ?? ''}T12:00:00Z`)),
		value: point.value ?? 0,
	}));

	const byAction = auditQuery.data?.counts?.byAction ?? [];
	const bucketTotals = new Map<string, number>();
	for (const row of byAction) {
		if (!row.action) {
			continue;
		}
		const key = typeBucket(row.action);
		bucketTotals.set(key, (bucketTotals.get(key) ?? 0) + (row.count ?? 0));
	}
	let typeTotal = 0;
	for (const value of bucketTotals.values()) {
		typeTotal += value;
	}
	const typeSegments: DonutSegment[] = TYPE_BUCKETS.map((bucket) => ({
		label: t(bucket.labelKey),
		value: bucketTotals.get(bucket.key) ?? 0,
		color: bucket.color,
	})).filter((segment) => segment.value > 0);

	const topOrganisations = topOrganisationsQuery.data?.items ?? [];

	return (
		<div className="space-y-5" data-testid="staff-dashboard-reports-panel">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="w-full sm:w-52">
					<PeriodSelect
						id="staff-dashboard-report-period"
						value={period}
						onChange={(next) =>
							void navigate({ search: { period: next }, replace: true })
						}
						ariaLabel={t('dashboard-filter-report-period')}
						range
					/>
				</div>
				<div className="ml-auto">
					<DashboardExportMenu
						startDate={startDate}
						onAuthFailure={() => setShouldLogout(true)}
					/>
				</div>
			</div>

			<div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<KpiCard
					testId="staff-dashboard-kpi-report-events"
					label={t('dashboard-kpi-audit-events')}
					icon={<IconFileSearch />}
					figure={auditEvents}
					locale={locale}
					query={seriesQuery}
					delta={auditDelta}
					deltaPeriod={deltaPeriod}
					sparkline={seriesPoints.map((point) => point.value)}
				/>
				<KpiCard
					testId="staff-dashboard-kpi-signins"
					label={t('dashboard-kpi-signins')}
					icon={<IconLogin2 />}
					figure={undefined}
					locale={locale}
				/>
				<KpiCard
					testId="staff-dashboard-kpi-failed-signins"
					label={t('dashboard-kpi-failed-signins')}
					icon={<IconKey />}
					figure={undefined}
					locale={locale}
				/>
				<KpiCard
					testId="staff-dashboard-kpi-impersonations"
					label={t('dashboard-kpi-impersonations')}
					icon={<IconMask />}
					figure={impersonationsQuery.data?.totalCount}
					locale={locale}
					query={impersonationsQuery}
				/>
			</div>

			{/* items-start: a 31-row table must not stretch the row and
			    recenter the neighbour card (fix8). */}
			<div className="grid gap-4 md:grid-cols-2 items-start">
				<ChartCard
					testId="staff-dashboard-events-per-day"
					label={t('dashboard-card-audit-events-per-day')}
					icon={<IconChartBar />}
					note={t('dashboard-note-events-per-day')}
					hero={
						<span className="flex flex-wrap items-baseline gap-x-2">
							{/* #2339 fix9 MI-5: an unknown figure is the same muted
							    « — » the KPI above shows, never a hard 0. */}
							{auditEvents === null || auditEvents === undefined ? (
								<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
							) : (
								formatCount(auditEvents, locale)
							)}
							{auditDelta ? (
								<span
									className="text-[12px] font-medium"
									style={{
										color:
											auditDelta.direction === 'up'
												? 'var(--publy-success)'
												: 'var(--publy-danger)',
									}}
								>
									{auditDelta.label}
								</span>
							) : null}
						</span>
					}
					series={
						seriesQuery.data
							? {
									status: 'ready',
									chart: (
										<ColumnChart
											points={seriesPoints}
											locale={locale}
											label={t('dashboard-chart-column')}
										/>
									),
									table: (
										<ChartTable
											head={[
												t('dashboard-col-date'),
												t('dashboard-col-events'),
											]}
											rows={seriesPoints.map((point) => [
												point.label,
												formatCount(point.value, locale),
											])}
										/>
									),
								}
							: {
									status: 'unavailable',
									sentence: t('dashboard-ghost-card-events-per-day'),
									ghost: (
										<>
											<GhostBars />
											<GhostAxis />
										</>
									),
								}
					}
					query={seriesQuery}
				/>

				<ChartCard
					testId="staff-dashboard-type-share"
					label={t('dashboard-card-type-share')}
					icon={<IconChartPie />}
					note={t('dashboard-note-type-share')}
					toggle={false}
					series={
						auditQuery.data
							? {
									status: 'ready',
									chart: (
										<div className="flex flex-col gap-6">
											<StackedShareBar
												segments={typeSegments}
												locale={locale}
											/>
											<ChartTable
												head={[
													t('dashboard-col-type'),
													t('dashboard-col-share'),
													t('dashboard-col-events'),
												]}
												rows={typeSegments.map((segment) => [
													segment.label,
													new Intl.NumberFormat(locale, {
														style: 'percent',
														minimumFractionDigits: 1,
														maximumFractionDigits: 1,
													}).format(
														typeTotal > 0 ? segment.value / typeTotal : 0,
													),
													formatCount(segment.value, locale),
												])}
											/>
										</div>
									),
									table: null,
								}
							: {
									status: 'unavailable',
									sentence: t('dashboard-ghost-card-type-share'),
									ghost: <GhostStacked />,
								}
					}
					query={auditQuery}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<ChartCard
					testId="staff-dashboard-signins-per-day"
					label={t('dashboard-card-signins-per-day')}
					icon={<IconTrendingUp />}
					note={`${t('dashboard-note-signins')} · ${t(periodLabelKey(period))}`}
					hero={UNKNOWN_VALUE}
					series={{
						status: 'unavailable',
						sentence: t('dashboard-ghost-card-signins-per-day'),
						ghost: (
							<>
								<GhostLine />
								<GhostAxis />
							</>
						),
					}}
				/>

				<ChartCard
					testId="staff-dashboard-top-orgs"
					label={t('dashboard-card-top-orgs')}
					icon={<IconChartBar />}
					note={t('dashboard-note-top-orgs')}
					toggle={false}
					series={
						topOrganisations.length > 0
							? {
									status: 'ready',
									chart: (
										<HorizontalBars
											rows={topOrganisations.map((item) => ({
												label: item.name ?? UNKNOWN_VALUE,
												value: item.count ?? 0,
												color: 'var(--publy-chart-1)',
											}))}
											locale={locale}
										/>
									),
									table: null,
								}
							: {
									status: 'unavailable',
									sentence: t('dashboard-ghost-card-top-orgs'),
									ghost: <GhostHBars rows={5} />,
								}
					}
					query={topOrganisationsQuery}
					// A served `items: []` is an empty period, not a missing
					// series: the shared empty state, never the ghost's
					// « Pas encore de données » (#2339 fix9 ME-2).
					isEmpty={(data) => (data.items ?? []).length === 0}
					emptySlot={
						<StateSurface
							title={t('dashboard-empty-top-orgs')}
							testId="staff-dashboard-top-orgs-empty"
						/>
					}
				/>
			</div>
		</div>
	);
};

/** The report's URL state: the period is optional, so a bare link stays
 * valid. */
type ReportsSearch = { period?: DashboardPeriod };

export const Route = createFileRoute('/_authed-layout/staff/dashboard/reports')(
	{
		validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
			period: parseDashboardPeriod(search.period),
		}),
		staticData: {
			crumbs: () => [
				{ kind: 'label', labelKey: 'nav-dashboard', to: '/staff/dashboard' },
				{ kind: 'label', labelKey: 'nav-dashboard-reports' },
			],
		},
		component: Reports,
	},
);
