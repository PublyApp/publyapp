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
import {
	toStaffProfileRows,
	useStaffProfilesQuery,
} from '~/lib/query/staff-profiles';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';
import { StaffListExportSelectedButton } from '~/routes/authed/staff/staff-list-export-selected';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	buildStaffProfileFilters,
	buildStaffProfileMobileCard,
	buildStaffProfileTotals,
	DEFAULT_STAFF_PROFILE_COLUMNS,
	exportStaffProfileRows,
	staffProfileColumns,
} from './_profile-columns';
import { buildListSelection, selectedListIds } from './_staff-list-selection';
import {
	buildStaffTeamPanelGroups,
	useStaffTeamOverview,
} from './_staff-list-team';
import { ProfilesListBulkActions } from './profiles/_profiles-bulk-actions';
import {
	parseStaffProfileListSearchParams,
	serializeStaffProfileListSearchParams,
	type StaffProfileListSearchParamInput,
	type StaffProfileListSearchParams,
} from './profiles/list-helpers';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffProfilesPage = () => {
	const { t, i18n } = useTranslation('common');
	const navigate = Route.useNavigate();
	const [shouldLogout, setShouldLogout] = useState(false);
	const search = parseStaffProfileListSearchParams(
		Route.useSearch() as StaffProfileListSearchParamInput,
	);

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeStaffProfileListSearchParams({ ...search, ...next }),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: search.members.join(','),
	});
	const query = useStaffProfilesQuery({
		q: controller.apiVariables.q,
		sortId: controller.apiVariables.sortId,
		sortOrder: controller.apiVariables.sortOrder,
		cursor: controller.apiVariables.cursor,
		limit: controller.apiVariables.size,
	});
	const team = useStaffTeamOverview();
	const rows = toStaffProfileRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const listSelection = buildListSelection(
		rows,
		selection,
		controller.search.resetDraftToCommitted,
	);
	const selectedIds = selectedListIds(rows, selection);

	const collectionComplete =
		query.data !== undefined &&
		query.data.nextCursor == null &&
		!controller.cursor.hasPreviousPage;

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

	const filtersValue: ListFiltersValue = { members: search.members };

	const setFilters = (next: ListFiltersValue): void => {
		selection.clearSelection();
		void navigate({
			search: serializeStaffProfileListSearchParams({
				...search,
				members: (next.members ??
					[]) as StaffProfileListSearchParams['members'],
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
			testId="staff-profiles-table"
			ariaLabel={t('profiles')}
			title={t('profiles')}
			description={t('staff-profiles-page-description')}
			searchPlaceholder={t('search-profiles')}
			rows={rows}
			columns={staffProfileColumns(t)}
			defaultColumns={[...DEFAULT_STAFF_PROFILE_COLUMNS]}
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
			filters={buildStaffProfileFilters(t)}
			filtersValue={filtersValue}
			onFiltersChange={setFilters}
			countsKnown={collectionComplete}
			emptyText={t('list-empty-staff-profiles')}
			locale={i18n.language}
			totals={(visible) => buildStaffProfileTotals(t, visible)}
			panelGroups={buildStaffTeamPanelGroups(
				t,
				'profiles',
				team.counts,
				navigateToTeam,
			)}
			onOpen={(row) =>
				void navigate({
					to: '/staff/profiles/$profileId',
					params: { profileId: row.id },
				})
			}
			openLabel={(row) => t('list-open-row', { name: row.name })}
			rowLabel={(row) => row.name}
			mobileCard={buildStaffProfileMobileCard(t)}
			selection={listSelection}
			renderActions={(row) => (
				<DataTableRowActions
					ariaLabel={t('actions-for', { name: row.name })}
					testId={`staff-profile-actions-${row.id}`}
				>
					<DropdownMenuItem
						render={
							<Link
								to="/staff/profiles/$profileId"
								params={{ profileId: row.id }}
							/>
						}
					>
						<IconEye />
						{t('view-profile')}
					</DropdownMenuItem>
				</DataTableRowActions>
			)}
			onExport={() => exportStaffProfileRows(rows, t)}
			newAction={
				<Link to="/staff/profiles/new" className={buttonVariants()}>
					<IconPlus aria-hidden="true" data-icon="inline-start" />
					{t('new-profile')}
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
						testId="staff-profiles-table"
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
					<ProfilesListBulkActions
						rows={rows}
						selection={selection}
						onSessionExpired={onSessionExpired}
					/>
					<StaffListExportSelectedButton
						rows={rows}
						selection={selection}
						fileNamePrefix="staff-profiles"
						columns={[
							{ header: t('profile'), getValue: (row) => row.name },
							{
								header: t('description'),
								getValue: (row) => row.description ?? '',
							},
							{
								header: t('members'),
								getValue: (row) => String(row.userAccountCount ?? ''),
							},
						]}
					/>
				</FloatingSelectionBar>
			}
		/>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/profiles')({
	staticData: {
		pageOwnsSecondaryPanel: true,
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-profiles' }],
	},
	validateSearch: (search) =>
		serializeStaffProfileListSearchParams(
			parseStaffProfileListSearchParams(
				search as StaffProfileListSearchParamInput,
			),
		),
	component: StaffProfilesPage,
});
