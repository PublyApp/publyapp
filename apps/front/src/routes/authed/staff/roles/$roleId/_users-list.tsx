import { IconUserPlus } from '@tabler/icons-react';
import type { SortingState } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ListPage } from '~/components/list/list-page';
import type {
	ListColumn,
	ListFiltersValue,
	ListSelection,
} from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import type { StaffRoleUserRow } from '~/lib/query/staff-role-users';

import type { StaffTeamOverview } from '../../_staff-list-team';
import { buildStaffTeamPanelGroups } from '../../_staff-list-team';
import { RoleUsersListBulkActions } from './_users-bulk-actions';

type Translate = (key: string, options?: Record<string, unknown>) => string;
const EMPTY_FILTERS: ListFiltersValue = {};

const displayName = (row: StaffRoleUserRow, t: Translate): string =>
	[row.firstName, row.lastName].filter(Boolean).join(' ') ||
	row.email ||
	t('no-email-address');

type StaffRoleUsersListProps = {
	roleId: string;
	rows: StaffRoleUserRow[];
	columns: ListColumn<StaffRoleUserRow>[];
	totalCount: number | null;
	pageIndex: number;
	size: number;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
	/** The users query's loading flags, grouped like `DataTable`'s. */
	queryState: {
		isPending: boolean;
		isError: boolean;
		isFetching: boolean;
		error?: unknown;
	};
	/** Replaces the generic list error description (a 403 explanation). */
	errorContent?: ReactNode;
	q: string;
	sorting: SortingState;
	selection: ListSelection;
	rowSelection: UseRowSelectionResult;
	selectedIds: ReadonlySet<string>;
	counts: StaffTeamOverview['counts'];
	onSearch: (q: string | undefined) => void;
	onSortingChange: (next: SortingState) => void;
	onClearSelection: () => void;
	onSelectAllVisible: () => void;
	onSessionExpired: () => void;
	onRetry: () => void;
	onPageSizeChange: (nextSize: number) => void;
	onNextPage: () => void;
	onPreviousPage: () => void;
	onOpen: (row: StaffRoleUserRow) => void;
	onTeamSelect: (
		path:
			| '/staff/staff-users'
			| '/staff/invitations'
			| '/staff/roles'
			| '/staff/audit-logs',
	) => void;
};

/** The role users inset list. Split out of the route so the page keeps its
 * data/error orchestration under the giant-component bound. */
export const StaffRoleUsersList = ({
	roleId,
	rows,
	columns,
	totalCount,
	pageIndex,
	size,
	hasPreviousPage,
	hasNextPage,
	queryState,
	errorContent,
	q,
	sorting,
	selection,
	rowSelection,
	selectedIds,
	counts,
	onSearch,
	onSortingChange,
	onClearSelection,
	onSelectAllVisible,
	onSessionExpired,
	onRetry,
	onPageSizeChange,
	onNextPage,
	onPreviousPage,
	onOpen,
	onTeamSelect,
}: StaffRoleUsersListProps) => {
	const { t } = useTranslation('common');
	const { isPending, isError, isFetching } = queryState;

	return (
		<div className="publy-page-fill">
			<ListPage
				testId="staff-role-users-table"
				ariaLabel={t('assigned-staff-role-users')}
				title={t('users')}
				rows={rows}
				columns={columns}
				defaultColumns={['name', 'email', 'status']}
				lockedColumn="name"
				sorting={sorting}
				onSortingChange={onSortingChange}
				q={q}
				onSearch={onSearch}
				searchPlaceholder={t('search-staff-role-users')}
				filters={[]}
				filtersValue={EMPTY_FILTERS}
				onFiltersChange={() => undefined}
				countsKnown={false}
				count={totalCount}
				emptyText={t('no-users-assigned-to-role')}
				inset={{ description: t('staff-role-users-list-description') }}
				totals={() => new Map()}
				panelGroups={buildStaffTeamPanelGroups(
					t,
					'roles',
					counts,
					onTeamSelect,
				)}
				newAction={{
					// ponytail: no bulk-assign endpoint exists yet — the role
					// overview is the only place membership is editable today.
					label: t('assign-staff-members'),
					icon: IconUserPlus,
					to: '/staff/roles/$roleId',
					params: { roleId },
					variant: 'outline',
				}}
				onOpen={onOpen}
				openLabel={(row) => t('list-open-row', { name: displayName(row, t) })}
				rowLabel={(row) => displayName(row, t)}
				mobileCard={(row) => ({
					title: displayName(row, t),
					sub: row.email,
				})}
				selection={selection}
				queryState={{ isPending, isError, error: queryState.error, onRetry }}
				errorContent={errorContent}
				footer={
					rows.length > 0 ? (
						<DataTableCursorFooter
							testId="staff-role-users-table"
							pageIndex={pageIndex}
							size={size}
							onSizeChange={onPageSizeChange}
							pageRowCount={rows.length}
							totalCount={totalCount}
							hasPreviousPage={hasPreviousPage}
							hasNextPage={hasNextPage}
							isPaginationPending={isFetching && !isPending}
							onNextPage={onNextPage}
							onPreviousPage={onPreviousPage}
							variant="flat"
						/>
					) : null
				}
				bulkBar={
					<FloatingSelectionBar
						selectedCount={selection.selectedIds.size}
						visibleCount={rows.length}
						allVisibleSelected={
							rows.length > 0 && selectedIds.size === rows.length
						}
						onClear={onClearSelection}
						onSelectAllVisible={onSelectAllVisible}
					>
						<RoleUsersListBulkActions
							roleId={roleId}
							rows={rows}
							selection={rowSelection}
							onSessionExpired={onSessionExpired}
						/>
					</FloatingSelectionBar>
				}
			/>
		</div>
	);
};
