import { IconUsers } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '~/components/table/data-table';
import type { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { ErrorStateSurface } from '~/components/ui/state-surface';
import { Switch } from '~/components/ui/switch';
import type { useStaffTenantProfileMemberAssignmentResolutionQuery } from '~/lib/query/staff-tenant-profiles';
import type { useStaffTenantUsersQuery } from '~/lib/query/staff-tenant-users';
import type { StaffTenantUserRow } from '~/lib/query/staff-tenant-users';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Per-row assign/unassign toggle, seeded from the batch "resolve assignment"
 * read (#875) so a row's switch starts checked when the tenant member is
 * already assigned — not just when THIS drawer session toggled it. Every
 * toggle click is still a single, immediately-persisted POST/DELETE against
 * the real per-member endpoint; the resolve read only feeds the initial
 * (and post-refresh) checked state.
 *
 * The first column links with the row's GLOBAL `id` (the tenant-users
 * candidate-list identity, matching `/users/{userId}`), per the mandatory
 * entity-link convention (docs/guides/front/conventions.md:254-258) —
 * step4b-rereview MAJOR 5. The assign/unassign toggle is keyed by
 * `userAccountId` (the tenant membership id the resolve/assign/unassign
 * endpoints all require), NEVER `row.id` — step4b-review BLOCKER 1. A row
 * whose assignment status has not resolved yet renders DISABLED rather than
 * unchecked-and-actionable, which would misrepresent an actually-assigned
 * member as available to assign (step4b-review MAJOR 3).
 */
export const makeAssignMembersColumns = (
	tenantId: string,
	t: Translate,
	assignedIds: Set<string>,
	resolvedIds: Set<string>,
	pendingIds: Set<string>,
	onToggle: (row: StaffTenantUserRow, checked: boolean) => void,
): ColumnDef<StaffTenantUserRow>[] => [
	{
		id: 'name',
		header: t('members'),
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/staff/tenants/$tenantId/users/$userId"
				params={{ tenantId, userId: row.original.id }}
				className="flex min-w-0 items-center gap-2.5 no-underline"
			>
				<PersonAvatar
					name={row.original.displayName}
					avatarUrl={row.original.avatarUrl}
				/>
				<span className="min-w-0 space-y-0.5">
					<span
						className="publy-record-link block truncate text-[13px] font-medium"
						title={row.original.displayName}
					>
						{row.original.displayName}
					</span>
					<span
						className="block truncate text-xs text-muted-foreground"
						title={row.original.email}
					>
						{row.original.email}
					</span>
				</span>
			</Link>
		),
	},
	{
		id: 'assigned',
		header: () => <span className="sr-only">{t('assign-members')}</span>,
		enableSorting: false,
		meta: { width: '64px', align: 'center' },
		cell: ({ row }) => {
			const userAccountId = row.original.userAccountId;

			return (
				<Switch
					checked={assignedIds.has(userAccountId)}
					disabled={
						pendingIds.has(userAccountId) || !resolvedIds.has(userAccountId)
					}
					onCheckedChange={(checked) => onToggle(row.original, checked)}
					aria-label={t('assign-member-toggle-label', {
						name: row.original.displayName,
					})}
					data-testid={`assign-member-toggle-${userAccountId}`}
				/>
			);
		},
	},
];

type AssignMembersTableProps = {
	tenantId: string;
	t: Translate;
	assignedIds: Set<string>;
	resolvedIds: Set<string>;
	pendingIds: Set<string>;
	onToggle: (row: StaffTenantUserRow, checked: boolean) => void;
	rows: StaffTenantUserRow[];
	usersQuery: ReturnType<typeof useStaffTenantUsersQuery>;
	controller: ReturnType<typeof useTableController>;
	resolutionQuery: ReturnType<
		typeof useStaffTenantProfileMemberAssignmentResolutionQuery
	>;
};

export const AssignMembersTable = ({
	tenantId,
	t,
	assignedIds,
	resolvedIds,
	pendingIds,
	onToggle,
	rows,
	usersQuery,
	controller,
	resolutionQuery,
}: AssignMembersTableProps) => {
	const columns = makeAssignMembersColumns(
		tenantId,
		t,
		assignedIds,
		resolvedIds,
		pendingIds,
		onToggle,
	);

	return (
		<>
			{resolutionQuery.isError ? (
				<ErrorStateSurface
					title={t('assign-members-resolution-error-title')}
					description={t('assign-members-resolution-error-description')}
					actions={
						<Button
							type="button"
							variant="outline"
							onClick={() => void resolutionQuery.refetch()}
						>
							{t('retry')}
						</Button>
					}
					testId="assign-members-resolution-error"
				/>
			) : null}
			<DataTable<StaffTenantUserRow>
				testId="assign-members-table"
				ariaLabel={t('assign-members')}
				columns={columns}
				rows={rows}
				getRowLabel={(row) => row.displayName}
				isPending={usersQuery.isPending}
				isError={usersQuery.isError}
				onRetry={() => void usersQuery.refetch()}
				emptyIcon={IconUsers}
				emptyTitle={t('no-tenant-members-to-assign')}
				noMatchTitle={t('tenant-users-no-match-title')}
				noMatchContent={t('tenant-users-no-match-description')}
				hasActiveSearch={Boolean(controller.search.committed)}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				pageIndex={controller.cursor.pageIndex}
				hasPreviousPage={controller.cursor.hasPreviousPage}
				hasNextPage={usersQuery.data?.nextCursor != null}
				isPaginationPending={usersQuery.isFetching}
				onNextPage={() =>
					controller.cursor.onNextPage(usersQuery.data?.nextCursor ?? undefined)
				}
				onPreviousPage={controller.cursor.onPreviousPage}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				searchPlaceholder={t('search-tenant-members')}
			/>
		</>
	);
};
