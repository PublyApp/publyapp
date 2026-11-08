import { IconBuilding, IconMail, IconMailForward } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StateSurface } from '~/components/ui/state-surface';
import { toStaffTenantRows } from '~/lib/query/staff-tenants';

import type {
	FindStaffInvitationsResult,
	FindTenantsAsStaffResponse,
} from '@org/client-ts/models/index';

import { GhostHBars } from './_chart-ghost';
import { ChartNote, ChartTable, HorizontalBars } from './_dashboard-charts';
import { formatCount, formatShare } from './_dashboard-format';
import {
	CardFoot,
	ChartCard,
	DashboardCard,
	DashboardCardQuery,
	ViewAllLink,
} from './_dashboard-ui';
import { PendingInvitationsTable } from './_overview-invitations-table';
import { TenantRows } from './_overview-tenant-rows';

const isEmptyList = <TData extends { data?: unknown[] | null }>(
	data: TData,
): boolean => (data.data ?? []).length === 0;

/** The overview's three list/outcome cards: invitation outcomes (an
 * UNFILTERED invitations query, B2), latest organisations (the only card the
 * « Organisations » filter drives, B3) and pending invitations. Each card owns
 * its query, so its loading/error/empty/data state renders through
 * `QueryDisplay`. */
export const OverviewLists = ({
	invitationOutcomesQuery,
	latestTenantsQuery,
	pendingInvitationsQuery,
	locale,
}: {
	invitationOutcomesQuery: UseQueryResult<FindStaffInvitationsResult, Error>;
	latestTenantsQuery: UseQueryResult<FindTenantsAsStaffResponse, Error>;
	pendingInvitationsQuery: UseQueryResult<FindStaffInvitationsResult, Error>;
	locale: string;
}) => {
	const { t } = useTranslation('common');
	const invitationCounts = invitationOutcomesQuery.data?.counts;

	const sentTotal = invitationCounts?.total ?? 0;
	const outcomeRows = [
		{
			label: t('dashboard-invitations-sent'),
			value: sentTotal,
			color: 'var(--publy-chart-seq-4)',
			detail: undefined,
		},
		{
			label: t('dashboard-invitations-accepted'),
			value: invitationCounts?.accepted ?? 0,
			color: 'var(--publy-chart-seq-3)',
			detail: formatShare(invitationCounts?.accepted ?? 0, sentTotal, locale),
		},
		{
			label: t('dashboard-invitations-expired'),
			value: invitationCounts?.expired ?? 0,
			color: 'var(--publy-chart-seq-2)',
			detail: formatShare(invitationCounts?.expired ?? 0, sentTotal, locale),
		},
		{
			label: t('dashboard-invitations-revoked'),
			value: invitationCounts?.revoked ?? 0,
			color: 'var(--publy-chart-seq-1)',
			detail: formatShare(invitationCounts?.revoked ?? 0, sentTotal, locale),
		},
	];

	return (
		<>
			<div className="grid gap-4 md:grid-cols-2">
				<ChartCard
					testId="staff-dashboard-invitation-outcomes"
					label={t('dashboard-card-invitation-outcomes')}
					icon={<IconMailForward />}
					note={t('dashboard-note-invitation-outcomes')}
					series={
						invitationCounts
							? {
									status: 'ready',
									chart: <HorizontalBars rows={outcomeRows} locale={locale} />,
									table: (
										<ChartTable
											head={[
												t('dashboard-col-status'),
												t('dashboard-col-invitations'),
												t('dashboard-col-share'),
											]}
											rows={outcomeRows.map((row) => [
												row.label,
												formatCount(row.value, locale),
												formatShare(row.value, sentTotal, locale),
											])}
										/>
									),
								}
							: {
									status: 'unavailable',
									sentence: t('dashboard-ghost-card-invitation-outcomes'),
									ghost: <GhostHBars rows={4} />,
								}
					}
					query={invitationOutcomesQuery}
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
					{/* The prototype's card is `.pa-shell-desc` (note only, 14px top /
					   16px sides) + `.card-body` (12px/16px around the rows) +
					   `.card-foot` (38px, 12px line) — #2339 fidelity. */}
					<div className="flex flex-col gap-[2px] px-4 pt-3.5 text-[13px] leading-[1.45]">
						<ChartNote>{t('dashboard-note-latest-tenants')}</ChartNote>
					</div>
					<div className="px-4 py-3">
						<DashboardCardQuery
							query={latestTenantsQuery}
							testId="staff-dashboard-latest-tenants"
							isEmpty={isEmptyList}
							emptySlot={
								<StateSurface
									title={t('overview-empty-tenants')}
									testId="staff-dashboard-latest-tenants-empty"
								/>
							}
						>
							{({ data }) => (
								<TenantRows tenants={toStaffTenantRows(data.data)} t={t} />
							)}
						</DashboardCardQuery>
					</div>
					<CardFoot>{t('dashboard-foot-latest-tenants')}</CardFoot>
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
				<div className="flex flex-col gap-[2px] px-4 pt-3.5 text-[13px] leading-[1.45]">
					<ChartNote>{t('dashboard-note-pending-invitations')}</ChartNote>
				</div>
				<div className="px-4 py-3">
					<DashboardCardQuery
						query={pendingInvitationsQuery}
						testId="staff-dashboard-pending-invitations"
						isEmpty={isEmptyList}
						emptySlot={
							<StateSurface
								title={t('overview-empty-invitations')}
								testId="staff-dashboard-pending-invitations-empty"
							/>
						}
					>
						{({ data }) => (
							<PendingInvitationsTable
								invitations={data.data ?? []}
								locale={locale}
								t={t}
							/>
						)}
					</DashboardCardQuery>
				</div>
				<CardFoot>{t('dashboard-foot-pending-invitations')}</CardFoot>
			</DashboardCard>
		</>
	);
};
