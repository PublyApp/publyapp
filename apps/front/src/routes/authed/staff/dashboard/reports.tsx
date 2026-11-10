import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { historyCategory } from '~/components/history/history-actions';
import { useStaffAuditLogsQuery } from '~/lib/query/staff-audit-logs';
import {
	useStaffDashboardSeriesQuery,
	useStaffDashboardTopOrganisationsQuery,
} from '~/lib/query/staff-dashboard';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import type { DonutSegment } from './_dashboard-charts';
import {
	dashboardWindow,
	parseDashboardPeriod,
	previousPeriod,
	type DashboardPeriod,
} from './_dashboard-filters';
import {
	formatSignedPercent,
	seriesTotal,
	toSeriesPoints,
} from './_dashboard-format';
import { ReportsFilters } from './_reports-filters';
import { ReportsKpis } from './_reports-kpis';
import { ReportsPrimaryCharts } from './_reports-primary-charts';
import { ReportsSecondaryCharts } from './_reports-secondary-charts';

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

/** The change against the previous window, when both totals are known and
 * the previous one is not 0 (a percentage of 0 has no meaning). */
const seriesDelta = (
	current: number | undefined,
	previous: number | undefined,
	locale: string,
): { label: string; direction: 'up' | 'down' } | undefined =>
	current !== undefined && previous !== undefined && previous > 0
		? {
				label: formatSignedPercent((current - previous) / previous, locale),
				direction: current >= previous ? ('up' as const) : ('down' as const),
			}
		: undefined;

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
	// figure is real.
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
	const signInsQuery = useStaffDashboardSeriesQuery({
		metric: 'sign_ins',
		startDate,
		endDate,
	});
	const previousSignInsQuery = useStaffDashboardSeriesQuery({
		metric: 'sign_ins',
		...previousPeriod(period),
	});
	const failedSignInsQuery = useStaffDashboardSeriesQuery({
		metric: 'failed_sign_ins',
		startDate,
		endDate,
	});
	const previousFailedSignInsQuery = useStaffDashboardSeriesQuery({
		metric: 'failed_sign_ins',
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
		signInsQuery.error,
		previousSignInsQuery.error,
		failedSignInsQuery.error,
		previousFailedSignInsQuery.error,
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
	const auditDelta = seriesDelta(currentTotal, previousTotal, locale);
	const signIns = seriesTotal(signInsQuery.data?.points);
	const signInsDelta = seriesDelta(
		signIns,
		seriesTotal(previousSignInsQuery.data?.points),
		locale,
	);
	const failedSignIns = seriesTotal(failedSignInsQuery.data?.points);
	const failedSignInsDelta = seriesDelta(
		failedSignIns,
		seriesTotal(previousFailedSignInsQuery.data?.points),
		locale,
	);

	const seriesPoints = toSeriesPoints(seriesQuery.data?.points, locale);
	const signInsPoints = toSeriesPoints(signInsQuery.data?.points, locale);
	const failedSignInsPoints = toSeriesPoints(
		failedSignInsQuery.data?.points,
		locale,
	);

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

	return (
		<div className="space-y-5" data-testid="staff-dashboard-reports-panel">
			<ReportsFilters
				period={period}
				startDate={startDate}
				onPeriodChange={(next) =>
					void navigate({ search: { period: next }, replace: true })
				}
				onAuthFailure={() => setShouldLogout(true)}
			/>

			<ReportsKpis
				auditEvents={auditEvents}
				seriesQuery={seriesQuery}
				previousSeriesQuery={previousSeriesQuery}
				seriesPoints={seriesPoints}
				impersonationsQuery={impersonationsQuery}
				auditDelta={auditDelta}
				signIns={signIns}
				signInsQuery={signInsQuery}
				previousSignInsQuery={previousSignInsQuery}
				signInsPoints={signInsPoints}
				signInsDelta={signInsDelta}
				failedSignIns={failedSignIns}
				failedSignInsQuery={failedSignInsQuery}
				previousFailedSignInsQuery={previousFailedSignInsQuery}
				failedSignInsPoints={failedSignInsPoints}
				failedSignInsDelta={failedSignInsDelta}
				period={period}
				locale={locale}
			/>

			<ReportsPrimaryCharts
				seriesQuery={seriesQuery}
				seriesPoints={seriesPoints}
				auditEvents={auditEvents}
				auditDelta={auditDelta}
				auditQuery={auditQuery}
				typeSegments={typeSegments}
				typeTotal={typeTotal}
				locale={locale}
			/>

			<ReportsSecondaryCharts
				period={period}
				signInsQuery={signInsQuery}
				signIns={signIns}
				signInsDelta={signInsDelta}
				signInsPoints={signInsPoints}
				topOrganisationsQuery={topOrganisationsQuery}
				locale={locale}
			/>
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
