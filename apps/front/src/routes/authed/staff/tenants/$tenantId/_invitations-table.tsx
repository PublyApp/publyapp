import { IconMail, IconPlus } from '@tabler/icons-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '~/components/table/data-table';
import type { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import type {
	StaffTenantInvitationRow,
	useStaffTenantInvitationsQuery,
} from '~/lib/query/staff-tenant-invitations';

import type { InvitationsFilterState } from './_invitations-filter-state';
import { InvitationsFilterMenus } from './_invitations-toolbar';

/** The tenant invitations data table, its empty/no-match copy and its filter
 * toolbar. Split out of the route file for
 * `react-doctor/no-giant-component`; every prop, test id and i18n key is
 * unchanged. */
export const InvitationsTable = ({
	columns,
	rows,
	invitationsQuery,
	controller,
	hasActiveSearch,
	filters,
	onInvite,
	t,
}: {
	columns: ColumnDef<StaffTenantInvitationRow>[];
	rows: StaffTenantInvitationRow[];
	invitationsQuery: ReturnType<typeof useStaffTenantInvitationsQuery>;
	controller: ReturnType<typeof useTableController>;
	hasActiveSearch: boolean;
	filters: InvitationsFilterState;
	onInvite: () => void;
	t: (key: string, options?: Record<string, unknown>) => string;
}) => (
	<DataTable
		testId="staff-tenant-invitations-table"
		ariaLabel={t('tenant-invitations-table-aria-label')}
		columns={columns}
		rows={rows}
		isPending={invitationsQuery.isPending}
		isError={invitationsQuery.isError}
		onRetry={() => void invitationsQuery.refetch()}
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
		hasActiveSearch={hasActiveSearch}
		sort={controller.sort}
		onSortChange={controller.onSortChange}
		size={controller.size}
		onSizeChange={controller.onSizeChange}
		pageIndex={controller.cursor.pageIndex}
		hasPreviousPage={controller.cursor.hasPreviousPage}
		hasNextPage={invitationsQuery.data?.nextCursor != null}
		isPaginationPending={invitationsQuery.isFetching}
		onNextPage={() =>
			controller.cursor.onNextPage(
				invitationsQuery.data?.nextCursor ?? undefined,
			)
		}
		onPreviousPage={controller.cursor.onPreviousPage}
		searchDraft={controller.search.draft}
		onSearchDraftChange={controller.search.onDraftChange}
		searchPlaceholder={t('search-invitations')}
		toolbarEnd={<InvitationsFilterMenus filters={filters} t={t} />}
	/>
);
