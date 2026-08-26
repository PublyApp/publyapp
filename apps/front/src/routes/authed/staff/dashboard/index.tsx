import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import {
	toStaffTenantRows,
	useStaffTenantsQuery,
	type StaffTenantRow,
} from '~/lib/query/staff-tenants';
import {
	toStaffUserRows,
	useStaffUsersQuery,
	type StaffUserRow,
} from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { OverviewListCard, StatusLabel } from './_overview-list-card';

/** How many rows each summary card shows. The cards link to the full lists;
 * they are a glance, not a replacement. */
const OVERVIEW_ROW_COUNT = 5;

/**
 * Data-mapping lines: every rendered value in the three summary cards comes
 * from these mappers over `GET /staff/tenants`, `GET /staff/staff-users` and
 * `GET /staff/invitations`. Stubbing any of them empties its card and fails
 * `index.test.tsx` ("renders the mapped platform summary").
 */
const toOverviewTenants = (
	items: Parameters<typeof toStaffTenantRows>[0],
): StaffTenantRow[] => toStaffTenantRows(items);

const toOverviewStaff = (
	items: Parameters<typeof toStaffUserRows>[0],
): StaffUserRow[] => toStaffUserRows(items);

type OverviewInvitation = {
	id: string;
	email: string;
	invitedByName: string | null;
};

const toOverviewInvitations = (
	items:
		| Array<{ id?: unknown; email?: unknown; invitedByName?: unknown }>
		| null
		| undefined,
): OverviewInvitation[] => {
	const rows: OverviewInvitation[] = [];

	for (const item of items ?? []) {
		const id = typeof item.id === 'string' ? item.id : '';
		if (!id) {
			continue;
		}

		rows.push({
			id,
			email: typeof item.email === 'string' ? item.email.trim() : '',
			invitedByName:
				typeof item.invitedByName === 'string' && item.invitedByName.trim()
					? item.invitedByName.trim()
					: null,
		});
	}

	return rows;
};

/**
 * The staff Dashboard › Overview tab: a real glance at the platform built
 * from the three existing staff list queries — latest tenants, staff members
 * and pending invitations — each linking to its full list. No fabricated
 * totals or charts; empty sources render their honest empty state (#818 F8).
 */
const StaffDashboardOverviewTab = () => {
	const { t } = useTranslation('common');

	const tenantsQuery = useStaffTenantsQuery({ size: OVERVIEW_ROW_COUNT });
	const usersQuery = useStaffUsersQuery({ size: OVERVIEW_ROW_COUNT });
	const invitationsQuery = useStaffInvitationsQuery({
		size: OVERVIEW_ROW_COUNT,
		status: 'pending',
	});

	// Logout gate: read the hoisted errors instead of branching on results.
	for (const queryError of [
		tenantsQuery.error,
		usersQuery.error,
		invitationsQuery.error,
	]) {
		if (queryError !== null && shouldLogoutForFailure(queryError)) {
			return <LogoutRedirect />;
		}
	}

	const tenants = toOverviewTenants(tenantsQuery.data?.data);
	const staff = toOverviewStaff(usersQuery.data?.data);
	const invitations = toOverviewInvitations(invitationsQuery.data?.data);

	return (
		<div className="space-y-5" data-testid="staff-dashboard-overview-panel">
			<div className="grid gap-5 lg:grid-cols-2">
				<OverviewListCard
					title={t('nav-tenants')}
					viewAllTo="/staff/tenants"
					testId="staff-dashboard-overview-tenants"
					isPending={tenantsQuery.isPending}
					error={tenantsQuery.error}
					onRetry={() => void tenantsQuery.refetch()}
					rows={tenants}
					emptyTitle={t('overview-empty-tenants')}
					t={t}
					renderRows={() => (
						<div className="divide-y">
							{tenants.map((tenant) => (
								<div
									className="flex items-center justify-between gap-3 py-2.5"
									data-testid="staff-dashboard-overview-tenant-row"
									key={tenant.id}
								>
									<p className="min-w-0 truncate text-sm">{tenant.name}</p>
									<div className="flex shrink-0 items-center gap-2">
										<span className="text-xs text-muted-foreground">
											{t('tenant-member-count', {
												count: tenant.usersCount,
											})}
										</span>
										<StatusLabel status={tenant.status} t={t} />
									</div>
								</div>
							))}
						</div>
					)}
				/>

				<OverviewListCard
					title={t('staff-users')}
					viewAllTo="/staff/staff-users"
					testId="staff-dashboard-overview-staff"
					isPending={usersQuery.isPending}
					error={usersQuery.error}
					onRetry={() => void usersQuery.refetch()}
					rows={staff}
					emptyTitle={t('overview-empty-staff')}
					t={t}
					renderRows={() => (
						<div className="divide-y">
							{staff.map((member) => (
								<div
									className="flex items-center justify-between gap-3 py-2.5"
									data-testid="staff-dashboard-overview-staff-row"
									key={member.id}
								>
									<p className="min-w-0 truncate text-sm">
										{member.displayName}
									</p>
									<StatusLabel status={member.status} t={t} />
								</div>
							))}
						</div>
					)}
				/>
			</div>

			<OverviewListCard
				title={t('pending-invitations')}
				viewAllTo="/staff/invitations"
				testId="staff-dashboard-overview-invitations"
				isPending={invitationsQuery.isPending}
				error={invitationsQuery.error}
				onRetry={() => void invitationsQuery.refetch()}
				rows={invitations}
				emptyTitle={t('overview-empty-invitations')}
				t={t}
				renderRows={() => (
					<div className="divide-y">
						{invitations.map((invitation) => (
							<div
								className="flex items-center justify-between gap-3 py-2.5"
								data-testid="staff-dashboard-overview-invitation-row"
								key={invitation.id}
							>
								<p className="min-w-0 truncate text-sm">{invitation.email}</p>
								{invitation.invitedByName ? (
									<span className="shrink-0 text-xs text-muted-foreground">
										{invitation.invitedByName}
									</span>
								) : null}
							</div>
						))}
					</div>
				)}
			/>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/dashboard/')({
	staticData: { crumbs: () => [{ kind: 'label', labelKey: 'nav-dashboard' }] },
	component: StaffDashboardOverviewTab,
});
