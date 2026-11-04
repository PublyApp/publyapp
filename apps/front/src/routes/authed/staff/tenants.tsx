import { IconPlus } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { ListPage } from '~/components/list/list-page';
import type { ListFiltersValue } from '~/components/list/list-types';
import { DataTableCursorFooter } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button.variants';
import {
	toStaffTenantRows,
	useStaffTenantsQuery,
} from '~/lib/query/staff-tenants';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { TenantBulkActions } from './_tenants-list-bulk-actions';
import { tenantColumns } from './_tenants-list-columns';
import {
	buildTenantFilters,
	buildTenantMobileCard,
	buildTenantTotals,
	DEFAULT_TENANT_COLUMNS,
	exportTenantRows,
	selectedTenantIds,
	toggleAllTenantSelection,
	toggleTenantSelection,
} from './_tenants-list-config';
import { TenantLifecycleActionsCell } from './_tenants-list-row-actions';
import { TenantStatCards } from './_tenants-list-stat-cards';
import {
	parseTenantListSearchParams,
	serializeTenantListSearchParams,
	serializeTenantStatusFilter,
	type TenantListSearchParamInput,
	type TenantListSearchParams,
} from './tenants-list-helpers';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const SERVER_SORT_IDS = new Set(['name', 'status', 'created_at', 'updated_at']);

const StaffTenantsPage = () => {
	const { t, i18n } = useTranslation('common');
	const navigate = Route.useNavigate();
	const [shouldLogout, setShouldLogout] = useState(false);
	const search = parseTenantListSearchParams(
		Route.useSearch() as TenantListSearchParamInput,
	);

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTenantListSearchParams(
				parseTenantListSearchParams({ ...search, ...next }),
			),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: [
			search.q,
			search.status.join(','),
			search.occupancy.join(','),
			search.locale.join(','),
			search.invitations.join(','),
			search.sortId ?? DEFAULT_SORT.id,
			search.sortOrder ?? DEFAULT_SORT.order,
		].join('|'),
	});

	// The API only sorts four ids; any other column sorts the loaded page
	// client-side, so the request keeps a valid server order.
	const sortState = controller.sort;
	const serverSort = SERVER_SORT_IDS.has(sortState.id);
	const statusFilter = serializeTenantStatusFilter(search.status);
	const query = useStaffTenantsQuery({
		...controller.apiVariables,
		// The API filters by status server-side, so a status filter reaches
		// matching organisations on later pages instead of only the loaded one.
		status: statusFilter,
		sortId: serverSort ? sortState.id : 'created_at',
		sortOrder: serverSort ? sortState.order : 'desc',
	});
	const rows = toStaffTenantRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const selectedIds = selectedTenantIds(rows, selection);
	const locale = i18n.language;

	// The list API returns `data` + `nextCursor` only: there is no total count
	// and no per-status count. Counters are exact only when the API proves the
	// loaded page is the whole collection (first page, no next cursor) and no
	// server-side status filter narrows it; otherwise they show « — », never a
	// page-scoped number presented as the total (issue #2275).
	// `totalCount`/`counts` describe the whole filtered collection (#2301).
	const countsKnown = query.data !== undefined;
	const counts = query.data?.counts;

	const onSessionExpired = useCallback(() => setShouldLogout(true), []);

	const filtersValue: ListFiltersValue = {
		status: search.status,
		occupancy: search.occupancy,
		locale: search.locale,
		invitations: search.invitations,
	};

	const setFilters = (next: ListFiltersValue): void => {
		selection.clearSelection();
		void navigate({
			search: serializeTenantListSearchParams({
				...search,
				status: (next.status ?? []) as TenantListSearchParams['status'],
				occupancy: (next.occupancy ??
					[]) as TenantListSearchParams['occupancy'],
				locale: (next.locale ?? []) as TenantListSearchParams['locale'],
				invitations: (next.invitations ??
					[]) as TenantListSearchParams['invitations'],
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
			testId="staff-tenants-table"
			ariaLabel={t('list-aria')}
			title={t('tenants')}
			searchPlaceholder={t('list-search-placeholder')}
			rows={rows}
			columns={tenantColumns(t, locale)}
			defaultColumns={[...DEFAULT_TENANT_COLUMNS]}
			lockedColumn="name"
			sorting={
				sortState
					? [{ id: sortState.id, desc: sortState.order === 'desc' }]
					: []
			}
			onSortingChange={(next) =>
				controller.onSortChange(
					next[0]
						? { id: next[0].id, order: next[0].desc ? 'desc' : 'asc' }
						: undefined,
				)
			}
			q={search.q ?? ''}
			onSearch={(next) => {
				// A pending search must not swap the rows a bulk selection points at.
				if (selection.selectedCount > 0) {
					return;
				}
				onSearchChange({ ...search, q: next, cursor: undefined });
			}}
			filters={buildTenantFilters(t)}
			filtersValue={filtersValue}
			onFiltersChange={setFilters}
			counts={{
				status: {
					active: counts?.active ?? null,
					pending: counts?.pending ?? null,
					suspended: counts?.suspended ?? null,
				},
				occupancy: {
					full: counts?.full ?? null,
					high:
						counts == null
							? null
							: (counts.almostFull ?? 0) - (counts.full ?? 0),
					available:
						counts == null
							? null
							: (counts.total ?? 0) - (counts.almostFull ?? 0),
				},
				locale: {
					fr:
						counts?.byLocale?.find((row) => row.locale === 'fr')?.count ?? null,
					en:
						counts?.byLocale?.find((row) => row.locale === 'en')?.count ?? null,
				},
			}}
			countsKnown={countsKnown}
			emptyText={t('list-empty')}
			locale={locale}
			cards={
				query.isPending ? undefined : (
					<TenantStatCards counts={counts ?? null} t={t} />
				)
			}
			totals={buildTenantTotals(t, counts ?? null)}
			onOpen={(row) =>
				void navigate({
					to: '/staff/tenants/$tenantId',
					params: { tenantId: row.id },
				})
			}
			openLabel={(row) => t('list-open-row', { name: row.name })}
			mobileCard={buildTenantMobileCard(t, locale)}
			selection={{
				selectedIds,
				onToggle: (id) => toggleTenantSelection(rows, selection, id),
				onToggleAll: (ids) => toggleAllTenantSelection(rows, selection, ids),
			}}
			renderActions={(row) => (
				<TenantLifecycleActionsCell
					tenant={row}
					onSessionExpired={onSessionExpired}
				/>
			)}
			onExport={() => exportTenantRows(rows, t, locale)}
			newAction={
				<Link to="/staff/tenants/new" className={buttonVariants()}>
					<IconPlus aria-hidden="true" data-icon="inline-start" />
					{t('new-organization')}
				</Link>
			}
			queryState={{
				isPending: query.isPending,
				isError: query.isError,
				error: query.error,
				onRetry: () => void query.refetch(),
			}}
			footer={
				rows.length > 0 ? (
					<DataTableCursorFooter
						testId="staff-tenants-table"
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
					<TenantBulkActions
						rows={rows}
						selection={selection}
						onSessionExpired={onSessionExpired}
					/>
				</FloatingSelectionBar>
			}
		/>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/tenants')({
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'nav-tenants' }],
		// The list page owns the whole side panel (its filter-shortcut groups,
		// #2274 §4.1): the shell must not stack its static section nav above
		// them, as the prototype's Organisations list does not (PROMPT §4.2).
		pageOwnsSecondaryPanel: true,
	},
	validateSearch: (search) =>
		serializeTenantListSearchParams(
			parseTenantListSearchParams(search as TenantListSearchParamInput),
		),
	component: StaffTenantsPage,
});
