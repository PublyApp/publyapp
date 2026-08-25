import { IconUsers } from '@tabler/icons-react';
import { DataTable } from '~/components/table/data-table';
import type { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { ErrorStateSurface } from '~/components/ui/state-surface';
import type { useStaffTenantProfileMemberAssignmentResolutionQuery } from '~/lib/query/staff-tenant-profiles';
import type { useStaffTenantUsersQuery } from '~/lib/query/staff-tenant-users';
import type { StaffTenantUserRow } from '~/lib/query/staff-tenant-users';

import { makeAssignMembersColumns } from './_assign-members-columns';

type Translate = (key: string, options?: Record<string, unknown>) => string;

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
				queryState={{
					isPending: usersQuery.isPending,
					isError: usersQuery.isError,
					onRetry: () => void usersQuery.refetch(),
					hasActiveSearch: Boolean(controller.search.committed),
				}}
				pagination={{
					pageIndex: controller.cursor.pageIndex,
					hasPreviousPage: controller.cursor.hasPreviousPage,
					hasNextPage: usersQuery.data?.nextCursor != null,
					isPaginationPending: usersQuery.isFetching,
					onNextPage: () =>
						controller.cursor.onNextPage(
							usersQuery.data?.nextCursor ?? undefined,
						),
					onPreviousPage: controller.cursor.onPreviousPage,
				}}
				getRowLabel={(row) => row.displayName}
				emptyIcon={IconUsers}
				emptyTitle={t('no-tenant-members-to-assign')}
				noMatchTitle={t('tenant-users-no-match-title')}
				noMatchContent={t('tenant-users-no-match-description')}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				searchPlaceholder={t('search-tenant-members')}
			/>
		</>
	);
};
