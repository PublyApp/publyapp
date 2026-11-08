import { IconActivity } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { useStaffAuditLogsQuery } from '~/lib/query/staff-audit-logs';
import { useStaffDashboardSeriesQuery } from '~/lib/query/staff-dashboard';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import { useStaffTenantsQuery } from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { GhostHeatmap } from './_chart-ghost';
import { Heatmap } from './_dashboard-charts';
import {
	heatmapWindow,
	parseDashboardPeriod,
	parseOrganisationScope,
	periodLabelKey,
	periodStart,
	previousPeriod,
	todayIso,
	type DashboardPeriod,
	type OrganisationScope,
} from './_dashboard-filters';
import {
	ChartCard,
	OrganisationScopeSelect,
	PeriodSelect,
	SampleDataChip,
} from './_dashboard-ui';
import { OverviewCharts } from './_overview-charts';
import { OverviewKpis } from './_overview-kpis';
import { OverviewLists } from './_overview-lists';

/** The five-row glance the two list cards show (the prototype's « cinq »). */
const CARD_ROW_COUNT = 5;

const HEATMAP_SCALE = [
	'var(--publy-chart-empty)',
	'var(--publy-chart-seq-1)',
	'var(--publy-chart-seq-2)',
	'var(--publy-chart-seq-3)',
	'var(--publy-chart-seq-4)',
] as const;

const seriesTotal = (
	points: ReadonlyArray<{ value?: number | null }> | null | undefined,
): number | undefined => {
	if (!points) {
		return undefined;
	}
	let total = 0;
	for (const point of points) {
		total += point.value ?? 0;
	}
	return total;
};

const Overview = () => {
	const { t, i18n } = useTranslation('common');
	const locale = i18n.language;
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const period: DashboardPeriod = search.period ?? '30d';
	const scope: OrganisationScope = search.scope ?? 'all';

	const onSearchChange = (next: {
		period?: DashboardPeriod;
		scope?: OrganisationScope;
	}): void => {
		void navigate({ search: { ...search, ...next }, replace: true });
	};

	// The counts and the status donut describe the whole platform: the
	// « Organisations » filter must not reach them, or « Actives » would read 0
	// as soon as « Suspendues uniquement » is picked (B3).
	const countsQuery = useStaffTenantsQuery({ size: 1 });
	// Only « Dernières organisations » follows the filter.
	const latestTenantsQuery = useStaffTenantsQuery({
		size: CARD_ROW_COUNT,
		sortId: 'created_at',
		sortOrder: 'desc',
		status: scope === 'all' ? undefined : scope,
	});
	const pendingInvitationsQuery = useStaffInvitationsQuery({
		size: CARD_ROW_COUNT,
		status: 'pending',
	});
	// The outcome facets must come from an UNFILTERED invitations query: the
	// API computes them over the status-filtered set, so reusing the pending
	// one would report accepted/expired/revoked as structural zeros (B2).
	const invitationOutcomesQuery = useStaffInvitationsQuery({ size: 1 });
	const auditQuery = useStaffAuditLogsQuery({
		size: 1,
		startDate: periodStart(period),
	});

	// The KPI delta and its sparkline need the same window twice: the current
	// one and the one before it. The only metric the series endpoint serves is
	// `audit_events` (#2348); `active_tenants` answers 422 by design.
	const currentWindow = {
		metric: 'audit_events' as const,
		startDate: periodStart(period),
		endDate: todayIso(),
	};
	const previousWindow = {
		metric: 'audit_events' as const,
		...previousPeriod(period),
	};
	const seriesQuery = useStaffDashboardSeriesQuery(currentWindow);
	const previousSeriesQuery = useStaffDashboardSeriesQuery(previousWindow);

	// The heatmap is the platform's last year, not the page's period: the
	// prototype fills the card with as many weeks as the API allows (366 days).
	const heatmapQuery = useStaffDashboardSeriesQuery({
		metric: 'audit_events',
		...heatmapWindow(),
	});

	for (const queryError of [
		countsQuery.error,
		latestTenantsQuery.error,
		pendingInvitationsQuery.error,
		invitationOutcomesQuery.error,
		auditQuery.error,
		seriesQuery.error,
		previousSeriesQuery.error,
		heatmapQuery.error,
	]) {
		if (queryError !== null && shouldLogoutForFailure(queryError)) {
			return <LogoutRedirect />;
		}
	}

	const currentTotal = seriesTotal(seriesQuery.data?.points);
	const previousTotal = seriesTotal(previousSeriesQuery.data?.points);
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

	return (
		<div className="space-y-5" data-testid="staff-dashboard-overview-panel">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="w-full sm:w-48">
					<PeriodSelect
						id="staff-dashboard-period"
						value={period}
						onChange={(next) => onSearchChange({ period: next })}
						ariaLabel={t('dashboard-filter-period')}
					/>
				</div>
				<div className="w-full sm:w-56">
					<OrganisationScopeSelect
						id="staff-dashboard-scope"
						value={scope}
						onChange={(next) => onSearchChange({ scope: next })}
					/>
				</div>
				<SampleDataChip className="ml-auto" />
			</div>

			<OverviewKpis
				activeTenants={countsQuery.data?.counts?.active}
				members={countsQuery.data?.counts?.members}
				auditEvents={auditQuery.data?.totalCount}
				pendingInvitations={pendingInvitationsQuery.data?.counts?.pending}
				countsQuery={countsQuery}
				auditQuery={auditQuery}
				pendingInvitationsQuery={pendingInvitationsQuery}
				auditDelta={auditDelta}
				auditDeltaPeriod={t(periodLabelKey(period))}
				auditSparkline={(seriesQuery.data?.points ?? []).map(
					(point) => point.value ?? 0,
				)}
				locale={locale}
			/>

			<OverviewCharts countsQuery={countsQuery} locale={locale} />

			<ChartCard
				testId="staff-dashboard-heatmap"
				label={t('dashboard-card-heatmap')}
				icon={<IconActivity />}
				note={
					heatmapQuery.data
						? t('dashboard-heatmap-note-weeks', {
								count: Math.ceil((heatmapQuery.data.points?.length ?? 0) / 7),
							})
						: t('dashboard-heatmap-note-empty')
				}
				toggle={false}
				action={
					<div
						data-testid="staff-dashboard-heatmap-legend"
						className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"
					>
						<span>{t('dashboard-heat-less')}</span>
						{HEATMAP_SCALE.map((color) => (
							<span
								key={color}
								className="size-3 rounded-[3px]"
								style={{ backgroundColor: color }}
							/>
						))}
						<span>{t('dashboard-heat-more')}</span>
					</div>
				}
				series={
					heatmapQuery.data
						? {
								status: 'ready',
								chart: (
									<Heatmap
										days={(heatmapQuery.data.points ?? []).map((point) => ({
											date: point.date ?? '',
											value: point.value ?? 0,
										}))}
										locale={locale}
									/>
								),
								table: null,
							}
						: {
								status: 'unavailable',
								sentence: t('dashboard-ghost-card-heatmap'),
								ghost: <GhostHeatmap />,
							}
				}
				query={heatmapQuery}
			/>

			<OverviewLists
				invitationOutcomesQuery={invitationOutcomesQuery}
				latestTenantsQuery={latestTenantsQuery}
				pendingInvitationsQuery={pendingInvitationsQuery}
				locale={locale}
			/>
		</div>
	);
};

/** The overview's URL state: both filters are optional, so a bare
 * `/staff/dashboard` link stays valid. */
type OverviewSearch = {
	period?: DashboardPeriod;
	scope?: OrganisationScope;
};

export const Route = createFileRoute('/_authed-layout/staff/dashboard/')({
	validateSearch: (search: Record<string, unknown>): OverviewSearch => ({
		period: parseDashboardPeriod(search.period),
		scope: parseOrganisationScope(search.scope),
	}),
	staticData: { crumbs: () => [{ kind: 'label', labelKey: 'nav-dashboard' }] },
	component: Overview,
});
