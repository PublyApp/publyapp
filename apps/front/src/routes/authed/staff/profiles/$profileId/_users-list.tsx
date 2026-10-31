import { IconUserPlus } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { SortingState } from '@tanstack/react-table';
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
import { buttonVariants } from '~/components/ui/button.variants';
import type { StaffProfileUserRow } from '~/lib/query/staff-profile-users';

import type { StaffTeamOverview } from '../../_staff-list-team';
import { buildStaffTeamPanelGroups } from '../../_staff-list-team';
import { ProfileUsersListBulkActions } from './_users-bulk-actions';

type Translate = (key: string, options?: Record<string, unknown>) => string;
const EMPTY_FILTERS: ListFiltersValue = {};

const displayName = (row: StaffProfileUserRow, t: Translate): string =>
	[row.firstName, row.lastName].filter(Boolean).join(' ') ||
	row.email ||
	t('no-email-address');

type StaffProfileUsersListProps = {
	profileId: string;
	rows: StaffProfileUserRow[];
	columns: ListColumn<StaffProfileUserRow>[];
	totalCount: number | null;
	pageIndex: number;
	size: number;
	hasPreviousPage: boolean;
	hasNextPage: boolean;
	isPending: boolean;
	isError: boolean;
	isFetching: boolean;
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
	onOpen: (row: StaffProfileUserRow) => void;
	onTeamSelect: (
		path:
			| '/staff/staff-users'
			| '/staff/invitations'
			| '/staff/profiles'
			| '/staff/audit-logs',
	) => void;
};

/** The profile users inset list. Split out of the route so the page keeps its
 * data/error orchestration under the giant-component bound. */
export const StaffProfileUsersList = ({
	profileId,
	rows,
	columns,
	totalCount,
	pageIndex,
	size,
	hasPreviousPage,
	hasNextPage,
	isPending,
	isError,
	isFetching,
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
}: StaffProfileUsersListProps) => {
	const { t } = useTranslation('common');

	return (
		<div className="publy-page-fill">
			<ListPage
				testId="staff-profile-users-table"
				ariaLabel={t('assigned-staff-profile-users')}
				title={t('users')}
				rows={rows}
				columns={columns}
				defaultColumns={['name', 'email', 'status']}
				lockedColumn="name"
				sorting={sorting}
				onSortingChange={onSortingChange}
				q={q}
				onSearch={onSearch}
				searchPlaceholder={t('search-staff-profile-users')}
				filters={[]}
				filtersValue={EMPTY_FILTERS}
				onFiltersChange={() => undefined}
				countsKnown={false}
				count={totalCount}
				emptyText={t('no-users-assigned-to-profile')}
				inset={{ description: t('staff-profile-users-list-description') }}
				totals={() => new Map()}
				panelGroups={buildStaffTeamPanelGroups(
					t,
					'profiles',
					counts,
					onTeamSelect,
				)}
				newAction={
					<Link
						to="/staff/profiles/$profileId"
						params={{ profileId }}
						className={buttonVariants({ variant: 'outline' })}
					>
						<IconUserPlus aria-hidden="true" data-icon="inline-start" />
						{t('assign-staff-members')}
					</Link>
				}
				onOpen={onOpen}
				openLabel={(row) => t('list-open-row', { name: displayName(row, t) })}
				rowLabel={(row) => displayName(row, t)}
				mobileCard={(row) => ({
					code: row.email,
					title: displayName(row, t),
					sub: row.email,
				})}
				selection={selection}
				queryState={{ isPending, isError, onRetry }}
				footer={
					rows.length > 0 ? (
						<DataTableCursorFooter
							testId="staff-profile-users-table"
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
						<ProfileUsersListBulkActions
							profileId={profileId}
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
