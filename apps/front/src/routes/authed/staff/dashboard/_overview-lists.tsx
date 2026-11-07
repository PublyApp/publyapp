import { IconBuilding, IconMail, IconMailForward } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { StaffTenantRow } from '~/lib/query/staff-tenants';

import type {
	InvitationListItem,
	StaffInvitationListCounts,
} from '@org/client-ts/models/index';

import {
	ChartNote,
	ChartTable,
	HorizontalBars,
	formatCount,
	formatShare,
	unknownTableRows,
} from './_dashboard-charts';
import {
	ChartCard,
	DashboardCard,
	DashboardCardState,
	ViewAllLink,
} from './_dashboard-ui';
import { PendingInvitationsTable } from './_overview-invitations-table';
import { TenantRows } from './_overview-tenant-rows';

export type CardQueryState = {
	isPending: boolean;
	error: unknown;
	onRetry: () => void;
};

/** The overview's three list/outcome cards: invitation outcomes, latest
 * organisations and pending invitations. */
export const OverviewLists = ({
	invitationCounts,
	tenants,
	invitations,
	tenantsState,
	invitationsState,
	locale,
}: {
	invitationCounts: StaffInvitationListCounts | null | undefined;
	tenants: readonly StaffTenantRow[];
	invitations: readonly InvitationListItem[];
	tenantsState: CardQueryState;
	invitationsState: CardQueryState;
	locale: string;
}) => {
	const { t } = useTranslation('common');

	const sentTotal = invitationCounts?.total ?? 0;
	const outcomeRows = invitationCounts
		? [
				{
					label: t('dashboard-invitations-sent'),
					value: sentTotal,
					color: 'var(--publy-chart-seq-4)',
					detail: undefined,
				},
				{
					label: t('dashboard-invitations-accepted'),
					value: invitationCounts.accepted ?? 0,
					color: 'var(--publy-chart-seq-3)',
					detail: formatShare(
						invitationCounts.accepted ?? 0,
						sentTotal,
						locale,
					),
				},
				{
					label: t('dashboard-invitations-expired'),
					value: invitationCounts.expired ?? 0,
					color: 'var(--publy-chart-seq-2)',
					detail: formatShare(invitationCounts.expired ?? 0, sentTotal, locale),
				},
				{
					label: t('dashboard-invitations-revoked'),
					value: invitationCounts.revoked ?? 0,
					color: 'var(--publy-chart-seq-1)',
					detail: formatShare(invitationCounts.revoked ?? 0, sentTotal, locale),
				},
			]
		: [];

	return (
		<>
			<div className="grid gap-4 md:grid-cols-2">
				<ChartCard
					testId="staff-dashboard-invitation-outcomes"
					label={t('dashboard-card-invitation-outcomes')}
					icon={<IconMailForward />}
					note={t('dashboard-note-invitation-outcomes')}
					series={{
						status: 'ready',
						chart: <HorizontalBars rows={outcomeRows} locale={locale} />,
						table: (
							<ChartTable
								head={[
									t('dashboard-col-status'),
									t('dashboard-col-invitations'),
									t('dashboard-col-share'),
								]}
								rows={
									invitationCounts
										? outcomeRows.map((row) => [
												row.label,
												formatCount(row.value, locale),
												formatShare(row.value, sentTotal, locale),
											])
										: unknownTableRows(3)
								}
							/>
						),
					}}
					state={invitationsState}
				/>

				<DashboardCard
					testId="staff-dashboard-latest-tenants"
					label={t('dashboard-card-latest-tenants')}
					icon={<IconBuilding />}
					actions={
						<ViewAllLink
							to="/staff/tenants"
							label={t('dashboard-view-all')}
							testId="staff-dashboard-latest-tenants-view-all"
						/>
					}
				>
					<ChartNote>{t('dashboard-note-latest-tenants')}</ChartNote>
					<div className="px-4 pb-3">
						<DashboardCardState
							testId="staff-dashboard-latest-tenants"
							{...tenantsState}
						>
							<TenantRows tenants={tenants} t={t} />
						</DashboardCardState>
					</div>
				</DashboardCard>
			</div>

			<DashboardCard
				testId="staff-dashboard-pending-invitations"
				label={t('dashboard-kpi-pending-invitations')}
				icon={<IconMail />}
				actions={
					<ViewAllLink
						to="/staff/invitations"
						label={t('dashboard-view-all')}
						testId="staff-dashboard-pending-invitations-view-all"
					/>
				}
			>
				<ChartNote>{t('dashboard-note-pending-invitations')}</ChartNote>
				<div className="px-4 pb-3">
					<DashboardCardState
						testId="staff-dashboard-pending-invitations"
						{...invitationsState}
					>
						<PendingInvitationsTable invitations={invitations} t={t} />
					</DashboardCardState>
				</div>
			</DashboardCard>
		</>
	);
};
