import { IconMail, IconPlus } from '@tabler/icons-react';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import type { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import type {
	StaffTenantInvitationRow,
	useStaffTenantInvitationsQuery,
} from '~/lib/query/staff-tenant-invitations';

import { InvitationToolbarFilters } from './_invitation-toolbar-filters';
import type { InvitationsFilterState } from './_invitations-filter-state';

type InvitationsTableProps = {
	columns: ColumnDef<StaffTenantInvitationRow>[];
	rows: StaffTenantInvitationRow[];
	query: ReturnType<typeof useStaffTenantInvitationsQuery>;
	controller: ReturnType<typeof useTableController>;
	hasActiveSearch: boolean;
	filters: InvitationsFilterState;
	onInvite: () => void;
	t: (key: string, options?: Record<string, unknown>) => string;
};

/** The tenant invitations data table with its empty/no-match copy and its
 * status filter toolbar. Split out of the route file for
 * `react-doctor/no-giant-component`; every prop and test id is unchanged. */
export const InvitationsTable = ({
	columns,
	rows,
	query,
	controller,
	hasActiveSearch,
	filters,
	onInvite,
	t,
}: InvitationsTableProps) => (
	<DataTable
		testId="staff-tenant-invitations-table"
		ariaLabel={t('tenant-invitations-table-aria-label')}
		columns={columns}
		rows={rows}
		query={query}
		hasActiveSearch={hasActiveSearch}
		pagination={{
			pageIndex: controller.cursor.pageIndex,
			hasPreviousPage: controller.cursor.hasPreviousPage,
			hasNextPage: query.data?.nextCursor != null,
			isPaginationPending: query.isFetching,
			onNextPage: () =>
				controller.cursor.onNextPage(query.data?.nextCursor ?? undefined),
			onPreviousPage: controller.cursor.onPreviousPage,
		}}
		getRowLabel={(row) => row.email}
		emptyIcon={IconMail}
		emptyTitle={t('tenant-invitations-empty-title')}
		emptyContent={t('tenant-invitations-empty-description')}
		emptyActions={
			<Button type="button" size="sm" variant="outline" onClick={onInvite}>
				<IconPlus aria-hidden="true" className="size-[15px]" />
				{t('invite-people')}
			</Button>
		}
		noMatchTitle={t('tenant-invitations-no-match-title')}
		noMatchContent={t('tenant-invitations-no-match-description')}
		sort={controller.sort}
		onSortChange={controller.onSortChange}
		size={controller.size}
		onSizeChange={controller.onSizeChange}
		searchDraft={controller.search.draft}
		onSearchDraftChange={controller.search.onDraftChange}
		searchPlaceholder={t('search-invitations')}
		selection={filters.selection}
		toolbarEnd={<InvitationToolbarFilters {...filters.toolbar} />}
	/>
);
