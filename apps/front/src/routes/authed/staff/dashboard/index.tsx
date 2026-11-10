import { IconActivity } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { preloadRouteQueries } from '~/lib/query/route-preload';
import {
	staffAuditLogsQueryOptions,
	useStaffAuditLogsQuery,
} from '~/lib/query/staff-audit-logs';
import {
	staffDashboardSeriesQueryOptions,
	useStaffDashboardSeriesQuery,
} from '~/lib/query/staff-dashboard';
import {
	staffInvitationsQueryOptions,
	useStaffInvitationsQuery,
} from '~/lib/query/staff-invitations';
import {
	staffTenantsQueryOptions,
	useStaffTenantsQuery,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { GhostHeatmap } from './_chart-ghost';
import { Heatmap } from './_dashboard-charts';
import {
	dashboardWindow,
	heatmapWindow,
	parseDashboardPeriod,
	parseOrganisationScope,
	previousPeriod,
	previousPeriodLabelKey,
	type DashboardPeriod,
	type OrganisationScope,
} from './_dashboard-filters';
import { formatSignedPercent, seriesTotal } from './_dashboard-format';
import {
	ChartCard,
	OrganisationScopeSelect,
	PeriodSelect,
} from './_dashboard-ui';
import { OverviewCharts } from './_overview-charts';
import { OverviewKpis } from './_overview-kpis';
import { OverviewLists } from './_overview-lists';

/** The five-row glance the two list cards show (the prototype's « cinq »). */
const CARD_ROW_COUNT = 5;

/** The overview's URL state: both filters are optional, so a bare
 * `/staff/dashboard` link stays valid. */
type OverviewSearch = {
	period?: DashboardPeriod;
	scope?: OrganisationScope;
};

/** The nine queries the overview renders, declared once: the loader warms them
 * and the page reads the same variables (so the window the loader fetched is
 * the window the page observes). */
const dashboardOverviewQueries = ({ search }: { search: OverviewSearch }) => {
	const period: DashboardPeriod = search.period ?? '30d';
	const scope: OrganisationScope = search.scope ?? 'all';
	// One period, one window: every card of this screen — the audit-list
	// facets, the KPI, its sparkline and the delta — reads these exact days,
	// today included (B MA-1).
	const { startDate, endDate } = dashboardWindow(period);

	return {
		// The counts and the status donut describe the whole platform: the
		// « Organisations » filter must not reach them, or « Actives » would read
		// 0 as soon as « Suspendues uniquement » is picked (B3).
		counts: { options: staffTenantsQueryOptions, variables: { size: 1 } },
		// Only « Dernières organisations » follows the filter.
		latestTenants: {
			options: staffTenantsQueryOptions,
			variables: {
				size: CARD_ROW_COUNT,
				sortId: 'created_at',
				sortOrder: 'desc' as const,
				status: scope === 'all' ? undefined : scope,
			},
		},
		pendingInvitations: {
			options: staffInvitationsQueryOptions,
			variables: { size: CARD_ROW_COUNT, status: 'pending' },
		},
		// The outcome facets must come from an UNFILTERED invitations query: the
		// API computes them over the status-filtered set, so reusing the pending
		// one would report accepted/expired/revoked as structural zeros (B2).
		invitationOutcomes: {
			options: staffInvitationsQueryOptions,
			variables: { size: 1 },
		},
		audit: {
			options: staffAuditLogsQueryOptions,
			variables: { size: 1, startDate, endDate },
		},
		// « Croissance des organisations » is the active-organisations curve: the
		// same window as every other card, from the lifecycle history (#2349).
		growth: {
			options: staffDashboardSeriesQueryOptions,
			variables: { metric: 'active_tenants' as const, startDate, endDate },
		},
		// The KPI delta and its sparkline need the same window twice: the current
		// one and the one before it.
		series: {
			options: staffDashboardSeriesQueryOptions,
			variables: { metric: 'audit_events' as const, startDate, endDate },
		},
		previousSeries: {
			options: staffDashboardSeriesQueryOptions,
			variables: { metric: 'audit_events' as const, ...previousPeriod(period) },
		},
		// The heatmap is the platform's last year, not the page's period: the
		// prototype fills the card with as many weeks as the API allows (366
		// days).
		heatmap: {
			options: staffDashboardSeriesQueryOptions,
			variables: { metric: 'audit_events' as const, ...heatmapWindow() },
		},
	};
};

const HEATMAP_SCALE = [
	'var(--publy-chart-empty)',
	'var(--publy-chart-seq-1)',
	'var(--publy-chart-seq-2)',
	'var(--publy-chart-seq-3)',
	'var(--publy-chart-seq-4)',
] as const;

const Overview = () => {
	const { t, i18n } = useTranslation('common');
	const locale = i18n.language;
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const period: DashboardPeriod = search.period ?? '30d';
	const scope: OrganisationScope = search.scope ?? 'all';
	const queries = dashboardOverviewQueries({ search });

	const onSearchChange = (next: {
		period?: DashboardPeriod;
		scope?: OrganisationScope;
	}): void => {
		void navigate({ search: { ...search, ...next }, replace: true });
	};

	const countsQuery = useStaffTenantsQuery(queries.counts.variables);
	const latestTenantsQuery = useStaffTenantsQuery(
		queries.latestTenants.variables,
	);
	const pendingInvitationsQuery = useStaffInvitationsQuery(
		queries.pendingInvitations.variables,
	);
	const invitationOutcomesQuery = useStaffInvitationsQuery(
		queries.invitationOutcomes.variables,
	);
	const auditQuery = useStaffAuditLogsQuery(queries.audit.variables);
	const growthQuery = useStaffDashboardSeriesQuery(queries.growth.variables);
	const seriesQuery = useStaffDashboardSeriesQuery(queries.series.variables);
	const previousSeriesQuery = useStaffDashboardSeriesQuery(
		queries.previousSeries.variables,
	);
	const heatmapQuery = useStaffDashboardSeriesQuery(queries.heatmap.variables);

	for (const queryError of [
		countsQuery.error,
		latestTenantsQuery.error,
		pendingInvitationsQuery.error,
		invitationOutcomesQuery.error,
		auditQuery.error,
		seriesQuery.error,
		previousSeriesQuery.error,
		heatmapQuery.error,
		growthQuery.error,
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
					label: formatSignedPercent(
						(currentTotal - previousTotal) / previousTotal,
						locale,
					),
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
			</div>

			<OverviewKpis
				activeTenants={countsQuery.data?.counts?.active}
				members={countsQuery.data?.counts?.members}
				seriesTotal={currentTotal}
				pendingInvitations={pendingInvitationsQuery.data?.counts?.pending}
				countsQuery={countsQuery}
				seriesQuery={seriesQuery}
				pendingInvitationsQuery={pendingInvitationsQuery}
				auditQuery={auditQuery}
				previousSeriesQuery={previousSeriesQuery}
				auditDelta={auditDelta}
				auditDeltaPeriod={t('dashboard-delta-vs-previous', {
					period: t(previousPeriodLabelKey(period)),
				})}
				auditSparkline={(seriesQuery.data?.points ?? []).map(
					(point) => point.value ?? 0,
				)}
				locale={locale}
			/>

			<OverviewCharts
				countsQuery={countsQuery}
				growthQuery={growthQuery}
				locale={locale}
			/>

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
										label={t('dashboard-chart-heatmap')}
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

export const Route = createFileRoute('/_authed-layout/staff/dashboard/')({
	validateSearch: (search: Record<string, unknown>): OverviewSearch => ({
		period: parseDashboardPeriod(search.period),
		scope: parseOrganisationScope(search.scope),
	}),
	staticData: { crumbs: () => [{ kind: 'label', labelKey: 'nav-dashboard' }] },
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => {
		preloadRouteQueries(
			context.queryClient,
			dashboardOverviewQueries({ search: deps }),
		);
	},
	component: Overview,
});
