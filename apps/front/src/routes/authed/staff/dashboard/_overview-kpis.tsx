import {
	IconBuilding,
	IconFileSearch,
	IconMail,
	IconUsers,
} from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import QueryDisplay from '~/components/query-display';

import type {
	FindAuditLogsResponse,
	GetDashboardSeriesForStaffResponse,
} from '@org/client-ts/models/index';

import { KpiCard } from './_dashboard-ui';

/** The four overview figures (§5.2): active organisations and their members
 * (the unfiltered tenants facets), the period's audit events and the pending
 * invitations. Each card owns its query, so its loading/error state renders
 * through `QueryDisplay`: a figure the API cannot source yet is never a
 * measured-looking 0. Only the audit-events card has a series to compare, so
 * only it carries a delta and a sparkline; the other three have no historical
 * endpoint (the tenants read exposes current counts, not a daily series).
 * The audit-events figure comes from that series, so the card is gated on the
 * series query — the same query the Rapports KPI gates on: the two screens
 * show the same figure or the same error, never one behind the other one's
 * unrelated endpoint (#2339 fix9 ME-1). The audit list is only a fallback for
 * a period the series answers with no point: it is gated `discreet` so its
 * loading/error never hides or errors the card, exactly as before. */
export const OverviewKpis = ({
	activeTenants,
	members,
	seriesTotal,
	pendingInvitations,
	countsQuery,
	seriesQuery,
	pendingInvitationsQuery,
	auditQuery,
	previousSeriesQuery,
	auditDelta,
	auditDeltaPeriod,
	auditSparkline,
	locale,
}: {
	activeTenants: number | null | undefined;
	members: number | null | undefined;
	seriesTotal: number | undefined;
	pendingInvitations: number | null | undefined;
	countsQuery: UseQueryResult<unknown, Error>;
	seriesQuery: UseQueryResult<unknown, Error>;
	pendingInvitationsQuery: UseQueryResult<unknown, Error>;
	/** The audit list, read only for its exact total when the series has no
	 * point. */
	auditQuery: UseQueryResult<FindAuditLogsResponse, Error>;
	/** The previous window's series, read only for the delta. */
	previousSeriesQuery: UseQueryResult<
		GetDashboardSeriesForStaffResponse,
		Error
	>;
	auditDelta?: { label: string; direction: 'up' | 'down' };
	auditDeltaPeriod?: string;
	auditSparkline?: readonly number[];
	locale: string;
}) => {
	const { t } = useTranslation('common');

	const auditEventsCard = (figure: number | null | undefined) => (
		<KpiCard
			testId="staff-dashboard-kpi-audit-events"
			label={t('dashboard-kpi-audit-events')}
			icon={<IconFileSearch />}
			figure={figure}
			locale={locale}
			query={seriesQuery}
			deltaQuery={previousSeriesQuery}
			delta={auditDelta}
			deltaPeriod={auditDeltaPeriod}
			sparkline={auditSparkline}
		/>
	);

	return (
		<div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
			<KpiCard
				testId="staff-dashboard-kpi-active-tenants"
				label={t('dashboard-kpi-active-tenants')}
				icon={<IconBuilding />}
				figure={activeTenants}
				locale={locale}
				query={countsQuery}
			/>
			<KpiCard
				testId="staff-dashboard-kpi-members"
				label={t('dashboard-kpi-members')}
				icon={<IconUsers />}
				figure={members}
				locale={locale}
				query={countsQuery}
			/>
			<QueryDisplay
				query={auditQuery}
				variant="discreet"
				// A fallback source: its absence only drops the fallback figure,
				// it never errors or hides the card (the series owns that).
				LoadingSlot={auditEventsCard(seriesTotal)}
				ErrorSlot={auditEventsCard(seriesTotal)}
			>
				{({ data }) => auditEventsCard(seriesTotal ?? data?.totalCount)}
			</QueryDisplay>
			<KpiCard
				testId="staff-dashboard-kpi-pending-invitations"
				label={t('dashboard-kpi-pending-invitations')}
				icon={<IconMail />}
				figure={pendingInvitations}
				locale={locale}
				query={pendingInvitationsQuery}
			/>
		</div>
	);
};
