import { IconActivity } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { useStaffAuditLogsQuery } from '~/lib/query/staff-audit-logs';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import { useStaffTenantsQuery } from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { GhostHeatmap } from './_chart-ghost';
import {
	parseDashboardPeriod,
	parseOrganisationScope,
	periodStart,
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

	for (const queryError of [
		countsQuery.error,
		latestTenantsQuery.error,
		pendingInvitationsQuery.error,
		invitationOutcomesQuery.error,
		auditQuery.error,
	]) {
		if (queryError !== null && shouldLogoutForFailure(queryError)) {
			return <LogoutRedirect />;
		}
	}

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
				locale={locale}
			/>

			<OverviewCharts countsQuery={countsQuery} locale={locale} />

			<ChartCard
				testId="staff-dashboard-heatmap"
				label={t('dashboard-card-heatmap')}
				icon={<IconActivity />}
				note={t('dashboard-heatmap-note-empty')}
				toggle={false}
				action={
					<div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
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
				series={{
					status: 'unavailable',
					sentence: t('dashboard-ghost-card-heatmap'),
					ghost: <GhostHeatmap />,
				}}
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
