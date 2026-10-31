import { IconEye, IconPlus } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { ListPage } from '~/components/list/list-page';
import type { ListFiltersValue } from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { DataTableRowActions } from '~/components/table/row-actions';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button.variants';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { toStaffUserRows, useStaffUsersQuery } from '~/lib/query/staff-users';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';
import { StaffListExportSelectedButton } from '~/routes/authed/staff/staff-list-export-selected';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { buildListSelection, selectedListIds } from './_staff-list-selection';
import {
	buildStaffTeamPanelGroups,
	useStaffTeamOverview,
} from './_staff-list-team';
import {
	buildStaffUserFilters,
	buildStaffUserMobileCard,
	buildStaffUserTotals,
	DEFAULT_STAFF_USER_COLUMNS,
	exportStaffUserRows,
	staffUserColumns,
} from './_staff-users-list-config';
import { StaffUsersStatCards } from './_staff-users-list-stat-cards';
import { StaffUsersListBulkActions } from './staff-users/_list-bulk-actions';
import {
	parseStaffUserListSearchParams,
	serializeStaffUserListSearchParams,
	type StaffUserListSearchParamInput,
	type StaffUserListSearchParams,
} from './staff-users/list-helpers';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffUsersPage = () => {
	const { t, i18n } = useTranslation('common');
	const { t: tStaff } = useTranslation('staff-users');
	const navigate = Route.useNavigate();
	const [shouldLogout, setShouldLogout] = useState(false);
	const search = parseStaffUserListSearchParams(
		Route.useSearch() as StaffUserListSearchParamInput,
	);

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeStaffUserListSearchParams({ ...search, ...next }),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: [
			search.status.join(','),
			search.level.join(','),
			search.sortId ?? DEFAULT_SORT.id,
			search.sortOrder ?? DEFAULT_SORT.order,
		].join('|'),
	});

	const query = useStaffUsersQuery({
		...controller.apiVariables,
		status: search.status.length > 0 ? search.status.join(',') : undefined,
	});
	const team = useStaffTeamOverview();
	const rows = toStaffUserRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const listSelection = buildListSelection(
		rows,
		selection,
		controller.search.resetDraftToCommitted,
	);
	const selectedIds = selectedListIds(rows, selection);

	// The cursor API exposes no total: totals and filter counts are exact only
	// when the loaded page is the whole collection and no server-side status
	// filter narrowed it. The StatCards use the independent team overview, so
	// they stay whole-collection figures even under a search.
	const collectionComplete =
		query.data !== undefined &&
		query.data.nextCursor == null &&
		!controller.cursor.hasPreviousPage;
	const countsKnown = collectionComplete && search.status.length === 0;

	const onSessionExpired = useCallback(() => setShouldLogout(true), []);
	const navigateToTeam = useCallback(
		(
			toBe:
				| '/staff/staff-users'
				| '/staff/invitations'
				| '/staff/profiles'
				| '/staff/audit-logs',
		) => {
			void navigate({ to: toBe });
		},
		[navigate],
	);

	const filtersValue: ListFiltersValue = {
		status: search.status,
		level: search.level,
	};

	const setFilters = (next: ListFiltersValue): void => {
		selection.clearSelection();
		void navigate({
			search: serializeStaffUserListSearchParams({
				...search,
				status: (next.status ?? []) as StaffUserListSearchParams['status'],
				level: (next.level ?? []) as StaffUserListSearchParams['level'],
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<ListPage
			testId="staff-users-table"
			ariaLabel={tStaff('staff-users-page-title')}
			title={tStaff('staff-users-page-title')}
			description={tStaff('staff-users-page-description')}
			searchPlaceholder={t('search-staff-users')}
			rows={rows}
			columns={staffUserColumns(t)}
			defaultColumns={[...DEFAULT_STAFF_USER_COLUMNS]}
			lockedColumn="name"
			sorting={[
				{ id: controller.sort.id, desc: controller.sort.order === 'desc' },
			]}
			onSortingChange={(next) =>
				controller.onSortChange(
					next[0]
						? { id: next[0].id, order: next[0].desc ? 'desc' : 'asc' }
						: undefined,
				)
			}
			q={search.q ?? ''}
			onSearch={(next) => {
				if (selection.selectedCount > 0) {
					return;
				}
				onSearchChange({ ...search, q: next, cursor: undefined });
			}}
			filters={buildStaffUserFilters(t, {
				includeLevels: countsKnown || search.level.length > 0,
			})}
			filtersValue={filtersValue}
			onFiltersChange={setFilters}
			countsKnown={countsKnown}
			emptyText={t('list-empty-staff-users')}
			locale={i18n.language}
			cards={
				<StaffUsersStatCards
					rows={team.staff}
					t={t}
					known={team.counts.staff !== null}
				/>
			}
			totals={(visible) => buildStaffUserTotals(t, visible)}
			panelGroups={buildStaffTeamPanelGroups(
				t,
				'staff',
				team.counts,
				navigateToTeam,
			)}
			onOpen={(row) =>
				void navigate({
					to: '/staff/staff-users/$userId',
					params: { userId: row.id },
				})
			}
			openLabel={(row) => t('list-open-row', { name: row.displayName })}
			rowLabel={(row) => row.displayName}
			mobileCard={buildStaffUserMobileCard(t)}
			selection={listSelection}
			renderActions={(row) => (
				<DataTableRowActions
					ariaLabel={t('actions-for', { name: row.displayName })}
					testId={`staff-user-actions-${row.id}`}
				>
					<DropdownMenuItem
						render={
							<Link
								to="/staff/staff-users/$userId"
								params={{ userId: row.id }}
							/>
						}
					>
						<IconEye />
						{t('view-profile')}
					</DropdownMenuItem>
				</DataTableRowActions>
			)}
			onExport={() => exportStaffUserRows(rows, t)}
			newAction={
				<Link to="/staff/invitations/new" className={buttonVariants()}>
					<IconPlus aria-hidden="true" data-icon="inline-start" />
					{t('invite-member')}
				</Link>
			}
			queryState={{
				isPending: query.isPending,
				isError: query.isError,
				onRetry: () => void query.refetch(),
			}}
			footer={
				rows.length > 0 ? (
					<DataTableCursorFooter
						testId="staff-users-table"
						pageIndex={controller.cursor.pageIndex}
						size={controller.size}
						onSizeChange={controller.onSizeChange}
						pageRowCount={rows.length}
						hasPreviousPage={controller.cursor.hasPreviousPage}
						hasNextPage={query.data?.nextCursor != null}
						isPaginationPending={query.isFetching}
						onNextPage={() =>
							controller.cursor.onNextPage(query.data?.nextCursor ?? undefined)
						}
						onPreviousPage={controller.cursor.onPreviousPage}
						variant="flat"
					/>
				) : null
			}
			bulkBar={
				<FloatingSelectionBar
					selectedCount={selection.selectedCount}
					visibleCount={rows.length}
					allVisibleSelected={
						rows.length > 0 && selectedIds.size === rows.length
					}
					onClear={selection.clearSelection}
					onSelectAllVisible={() =>
						selection.onSelectionChange(new Set(rows.map((row) => row.id)))
					}
				>
					<StaffUsersListBulkActions
						rows={rows}
						selection={selection}
						onSessionExpired={onSessionExpired}
					/>
					<StaffListExportSelectedButton
						rows={rows}
						selection={selection}
						fileNamePrefix="staff-users"
						columns={[
							{ header: t('name'), getValue: (row) => row.displayName },
							{ header: t('email'), getValue: (row) => row.email },
							{
								header: t('level'),
								getValue: (row) => row.level ?? '',
							},
							{
								header: t('status'),
								getValue: (row) => row.status ?? '',
							},
						]}
					/>
				</FloatingSelectionBar>
			}
		/>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	staticData: {
		i18nNamespaces: ['staff-users'],
		pageOwnsSecondaryPanel: true,
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-breadcrumb' }],
	},
	validateSearch: (search) =>
		serializeStaffUserListSearchParams(
			parseStaffUserListSearchParams(search as StaffUserListSearchParamInput),
		),
	component: StaffUsersPage,
});
