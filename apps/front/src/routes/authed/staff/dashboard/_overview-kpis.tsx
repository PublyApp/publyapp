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

import { seriesDelta, seriesLastValue } from './_dashboard-format';
import { KpiCard } from './_dashboard-ui';

type SeriesQuery = UseQueryResult<GetDashboardSeriesForStaffResponse, Error>;

/** A level card's comparison, from its series and the previous window's: the
 * delta is the window's last value against the previous window's last one,
 * and the sparkline is the window itself. A series that is missing or failed
 * only drops the comparison, never the figure. */
const levelTrend = (
	current: SeriesQuery,
	previous: SeriesQuery,
	deltaPeriod: string | undefined,
	locale: string,
) => ({
	delta: seriesDelta(
		seriesLastValue(current.data?.points),
		seriesLastValue(previous.data?.points),
		locale,
	),
	deltaQuery: previous,
	deltaPeriod,
	sparkline: (current.data?.points ?? []).map((point) => point.value ?? 0),
});

/** The four overview figures (§5.2): active organisations and their members
 * (the unfiltered tenants facets), the period's audit events and the pending
 * organisation invitations (all from the unfiltered tenants read). Each card
 * owns its query, so its loading/error state renders through `QueryDisplay`:
 * a figure the API cannot source is never a measured-looking 0. The audit,
 * members and pending-invitations cards carry a delta and a sparkline from
 * their daily series (#2355); the active-organisations card has none yet.
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
	auditQuery,
	previousSeriesQuery,
	auditDelta,
	deltaPeriod,
	auditSparkline,
	membersSeriesQuery,
	previousMembersSeriesQuery,
	pendingInvitationsSeriesQuery,
	previousPendingInvitationsSeriesQuery,
	locale,
}: {
	activeTenants: number | null | undefined;
	members: number | null | undefined;
	seriesTotal: number | undefined;
	pendingInvitations: number | null | undefined;
	countsQuery: UseQueryResult<unknown, Error>;
	seriesQuery: UseQueryResult<unknown, Error>;
	/** The audit list, read only for its exact total when the series has no
	 * point. */
	auditQuery: UseQueryResult<FindAuditLogsResponse, Error>;
	/** The previous window's series, read only for the delta. */
	previousSeriesQuery: UseQueryResult<
		GetDashboardSeriesForStaffResponse,
		Error
	>;
	auditDelta?: { label: string; direction: 'up' | 'down' };
	/** The comparison window's name, shared by the three cards with a delta. */
	deltaPeriod?: string;
	auditSparkline?: readonly number[];
	/** The level cards' series (#2355): this window and the previous one. */
	membersSeriesQuery: SeriesQuery;
	previousMembersSeriesQuery: SeriesQuery;
	pendingInvitationsSeriesQuery: SeriesQuery;
	previousPendingInvitationsSeriesQuery: SeriesQuery;
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
			deltaPeriod={deltaPeriod}
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
				{...levelTrend(
					membersSeriesQuery,
					previousMembersSeriesQuery,
					deltaPeriod,
					locale,
				)}
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
				query={countsQuery}
				{...levelTrend(
					pendingInvitationsSeriesQuery,
					previousPendingInvitationsSeriesQuery,
					deltaPeriod,
					locale,
				)}
			/>
		</div>
	);
};
