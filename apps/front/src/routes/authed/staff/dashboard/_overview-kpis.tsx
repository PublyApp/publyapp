import {
	IconBuilding,
	IconFileSearch,
	IconMail,
	IconUsers,
} from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { KpiCard } from './_dashboard-ui';

/** The four overview figures (§5.2): active organisations and their members
 * (the unfiltered tenants facets), the period's audit events and the pending
 * invitations. Each card owns its query, so its loading/error state renders
 * through `QueryDisplay`: a figure the API cannot source yet is never a
 * measured-looking 0. Only the audit-events card has a series to compare, so
 * only it carries a delta and a sparkline; the other three have no historical
 * endpoint (the tenants read exposes current counts, not a daily series). */
export const OverviewKpis = ({
	activeTenants,
	members,
	auditEvents,
	pendingInvitations,
	countsQuery,
	auditQuery,
	pendingInvitationsQuery,
	auditDelta,
	auditDeltaPeriod,
	auditSparkline,
	locale,
}: {
	activeTenants: number | null | undefined;
	members: number | null | undefined;
	auditEvents: number | null | undefined;
	pendingInvitations: number | null | undefined;
	countsQuery: UseQueryResult<unknown, Error>;
	auditQuery: UseQueryResult<unknown, Error>;
	pendingInvitationsQuery: UseQueryResult<unknown, Error>;
	auditDelta?: { label: string; direction: 'up' | 'down' };
	auditDeltaPeriod?: string;
	auditSparkline?: readonly number[];
	locale: string;
}) => {
	const { t } = useTranslation('common');

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
			<KpiCard
				testId="staff-dashboard-kpi-audit-events"
				label={t('dashboard-kpi-audit-events')}
				icon={<IconFileSearch />}
				figure={auditEvents}
				locale={locale}
				query={auditQuery}
				delta={auditDelta}
				deltaPeriod={auditDeltaPeriod}
				sparkline={auditSparkline}
			/>
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
