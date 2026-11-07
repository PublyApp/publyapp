import {
	IconBuilding,
	IconFileSearch,
	IconMail,
	IconUsers,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '~/components/ui/stat-card';

import { GhostSpark } from './_chart-ghost';
import { UNKNOWN_VALUE, formatCount } from './_dashboard-charts';

/** The four overview figures (§5.2): active organisations, their members, the
 * period's audit events and the pending invitations. A figure the API has not
 * answered is a muted « — ». Their delta/sparkline series has no endpoint yet,
 * so the footer is the « Pas encore de données » ghost at the delta's height. */
export const OverviewKpis = ({
	activeTenants,
	members,
	auditEvents,
	pendingInvitations,
	locale,
}: {
	activeTenants: number | null | undefined;
	members: number | null | undefined;
	auditEvents: number | null | undefined;
	pendingInvitations: number | null | undefined;
	locale: string;
}) => {
	const { t } = useTranslation('common');
	const value = (figure: number | null | undefined): ReactNode =>
		figure === null || figure === undefined ? (
			<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
		) : (
			formatCount(figure, locale)
		);
	const ghostFooter = (
		<>
			<span className="min-w-0 truncate">{t('dashboard-ghost-tag')}</span>
			<GhostSpark />
		</>
	);

	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
			<StatCard
				testId="staff-dashboard-kpi-active-tenants"
				label={t('dashboard-kpi-active-tenants')}
				icon={<IconBuilding />}
				value={value(activeTenants)}
				footer={ghostFooter}
				unavailable
			/>
			<StatCard
				testId="staff-dashboard-kpi-members"
				label={t('dashboard-kpi-members')}
				icon={<IconUsers />}
				value={value(members)}
				footer={ghostFooter}
				unavailable
			/>
			<StatCard
				testId="staff-dashboard-kpi-audit-events"
				label={t('dashboard-kpi-audit-events')}
				icon={<IconFileSearch />}
				value={value(auditEvents)}
				footer={ghostFooter}
				unavailable
			/>
			<StatCard
				testId="staff-dashboard-kpi-pending-invitations"
				label={t('dashboard-kpi-pending-invitations')}
				icon={<IconMail />}
				value={value(pendingInvitations)}
				footer={ghostFooter}
				unavailable
			/>
		</div>
	);
};
