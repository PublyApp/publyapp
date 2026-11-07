import { IconActivity } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { useStaffAuditLogsQuery } from '~/lib/query/staff-audit-logs';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import {
	toStaffTenantRows,
	useStaffTenantsQuery,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { GhostHeatmap } from './_chart-ghost';
import {
	ChartCard,
	OrganisationScopeSelect,
	PeriodSelect,
	periodStart,
	type DashboardPeriod,
	type OrganisationScope,
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
	const [period, setPeriod] = useState<DashboardPeriod>('30d');
	const [scope, setScope] = useState<OrganisationScope>('all');

	const tenantsQuery = useStaffTenantsQuery({
		size: CARD_ROW_COUNT,
		sortId: 'created_at',
		sortOrder: 'desc',
		status: scope === 'all' ? undefined : scope,
	});
	const invitationsQuery = useStaffInvitationsQuery({
		size: CARD_ROW_COUNT,
		status: 'pending',
	});
	const auditQuery = useStaffAuditLogsQuery({
		size: 1,
		startDate: periodStart(period),
	});

	for (const queryError of [
		tenantsQuery.error,
		invitationsQuery.error,
		auditQuery.error,
	]) {
		if (queryError !== null && shouldLogoutForFailure(queryError)) {
			return <LogoutRedirect />;
		}
	}

	const tenantsState = {
		isPending: tenantsQuery.isPending,
		error: tenantsQuery.error,
		onRetry: () => void tenantsQuery.refetch(),
	};
	const invitationsState = {
		isPending: invitationsQuery.isPending,
		error: invitationsQuery.error,
		onRetry: () => void invitationsQuery.refetch(),
	};

	return (
		<div className="space-y-4" data-testid="staff-dashboard-overview-panel">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="w-full sm:w-48">
					<PeriodSelect
						id="staff-dashboard-period"
						value={period}
						onChange={setPeriod}
						ariaLabel={t('dashboard-filter-period')}
					/>
				</div>
				<div className="w-full sm:w-56">
					<OrganisationScopeSelect
						id="staff-dashboard-scope"
						value={scope}
						onChange={setScope}
					/>
				</div>
			</div>

			<OverviewKpis
				activeTenants={tenantsQuery.data?.counts?.active}
				members={tenantsQuery.data?.counts?.members}
				auditEvents={auditQuery.data?.totalCount}
				pendingInvitations={invitationsQuery.data?.counts?.pending}
				locale={locale}
			/>

			<OverviewCharts
				counts={tenantsQuery.data?.counts}
				isPending={tenantsState.isPending}
				error={tenantsState.error}
				onRetry={tenantsState.onRetry}
				locale={locale}
			/>

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
				invitationCounts={invitationsQuery.data?.counts}
				tenants={toStaffTenantRows(tenantsQuery.data?.data)}
				invitations={invitationsQuery.data?.data ?? []}
				tenantsState={tenantsState}
				invitationsState={invitationsState}
				locale={locale}
			/>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/dashboard/')({
	staticData: { crumbs: () => [{ kind: 'label', labelKey: 'nav-dashboard' }] },
	component: Overview,
});
