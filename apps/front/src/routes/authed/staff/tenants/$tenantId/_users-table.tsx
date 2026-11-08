import { IconPlus, IconUsers } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueryDisplayQuery } from '~/components/query-display';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import type { UseTableControllerResult } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import type { StaffTenantUserRow } from '~/lib/query/staff-tenant-users';

export const TenantUsersTable = ({
	columns,
	rows,
	controller,
	selection,
	hasActiveFilters,
	query,
	nextCursor,
	onInvite,
	toolbarEnd,
}: {
	columns: ColumnDef<StaffTenantUserRow>[];
	rows: StaffTenantUserRow[];
	controller: UseTableControllerResult;
	selection: UseRowSelectionResult;
	hasActiveFilters: boolean;
	query: QueryDisplayQuery;
	nextCursor: string | undefined;
	onInvite: () => void;
	toolbarEnd: ReactNode;
}) => {
	const { t } = useTranslation('common');

	return (
		<DataTable<StaffTenantUserRow>
			testId="staff-tenant-users-table"
			ariaLabel={t('tenant-users-table-aria-label')}
			columns={columns}
			rows={rows}
			query={query}
			hasActiveSearch={hasActiveFilters}
			pagination={{
				pageIndex: controller.cursor.pageIndex,
				hasPreviousPage: controller.cursor.hasPreviousPage,
				hasNextPage: nextCursor != null,
				isPaginationPending: query.isFetching,
				onNextPage: () => controller.cursor.onNextPage(nextCursor),
				onPreviousPage: controller.cursor.onPreviousPage,
			}}
			getRowLabel={(row) => row.displayName}
			emptyIcon={IconUsers}
			emptyTitle={t('tenant-users-empty-title')}
			emptyContent={t('tenant-users-empty-description')}
			emptyActions={
				<Button type="button" size="sm" variant="outline" onClick={onInvite}>
					<IconPlus aria-hidden="true" className="size-[15px]" />
					{t('invite-people')}
				</Button>
			}
			noMatchTitle={t('tenant-users-no-match-title')}
			noMatchContent={t('tenant-users-no-match-description')}
			sort={controller.sort}
			onSortChange={controller.onSortChange}
			size={controller.size}
			onSizeChange={controller.onSizeChange}
			searchDraft={controller.search.draft}
			onSearchDraftChange={controller.search.onDraftChange}
			searchPlaceholder={t('search-tenant-members')}
			selection={selection}
			toolbarEnd={toolbarEnd}
		/>
	);
};
