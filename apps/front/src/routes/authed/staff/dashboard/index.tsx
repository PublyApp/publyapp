import { IconArrowRight } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { buttonVariants } from '~/components/ui/button.variants';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StatusPill } from '~/components/ui/product-page';
import { StateSurface } from '~/components/ui/state-surface';
import { statusPillTone } from '~/components/ui/status-tone';
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

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

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

/** Lifecycle status → the existing `status-*` label key in `common`; anything
 * else falls back to the backend's own string (the data, not a guess). */
const STATUS_LABEL_KEYS = {
	active: 'status-active',
	pending: 'status-pending',
	suspended: 'status-suspended',
	globallysuspended: 'status-globally-suspended',
	globally_suspended: 'status-globally-suspended',
} as const;

const StatusLabel = ({
	status,
	t,
}: {
	status: string | null;
	t: (key: string) => string;
}) => {
	const normalized = status?.trim().toLowerCase() ?? '';
	if (!normalized) {
		return null;
	}

	const labelKey =
		STATUS_LABEL_KEYS[normalized as keyof typeof STATUS_LABEL_KEYS];

	return (
		<StatusPill tone={statusPillTone(status)}>
			{labelKey ? t(labelKey) : status}
		</StatusPill>
	);
};

/**
 * One summary card: title + "view all" link, then QueryDisplay-driven
 * loading/error/empty/content states over the passed rows. All copy comes
 * from `t`; no fabricated numbers or rows.
 */
const OverviewListCard = ({
	title,
	viewAllTo,
	testId,
	isPending,
	error,
	onRetry,
	rows,
	emptyTitle,
	renderRows,
	t,
}: {
	title: string;
	viewAllTo: string;
	testId: string;
	isPending: boolean;
	error: Error | null;
	onRetry: () => void;
	rows: unknown[];
	emptyTitle: string;
	renderRows: () => ReactNode;
	t: (key: string) => string;
}) => {
	let body: ReactNode;
	if (isPending) {
		body = (
			<div className="space-y-3" data-testid={`${testId}-loading`}>
				<div className="h-4 w-2/5 animate-pulse rounded-[var(--publy-radius-sm)] bg-muted" />
				<div className="h-4 w-1/3 animate-pulse rounded-[var(--publy-radius-sm)] bg-muted" />
			</div>
		);
	} else if (error) {
		body = (
			<StateSurface
				tone="danger"
				title={t('overview-error-title')}
				actions={
					<button
						type="button"
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
						onClick={onRetry}
					>
						{t('retry')}
					</button>
				}
				testId={`${testId}-error`}
			/>
		);
	} else if (rows.length === 0) {
		body = <StateSurface title={emptyTitle} testId={`${testId}-empty`} />;
	} else {
		body = renderRows();
	}

	return (
		<Card data-testid={testId}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<Link
					to={viewAllTo}
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					{t('view-all')}
					<IconArrowRight aria-hidden="true" className="size-4" />
				</Link>
			</CardHeader>
			<CardContent>{body}</CardContent>
		</Card>
	);
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
