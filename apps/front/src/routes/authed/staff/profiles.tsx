import { IconPlus } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useRowSelection } from '~/components/table/use-row-selection';
import type { TableSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button.variants';
import { PageHeader } from '~/components/ui/product-page';
import {
	toStaffProfileRows,
	useStaffProfilesQuery,
} from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
	validateTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';
import { StaffListExportSelectedButton } from '~/routes/authed/staff/staff-list-export-selected';

import { buildColumns } from './_profile-columns';
import { ProfilesListBulkActions } from './profiles/_profiles-bulk-actions';

// Default server ordering by creation date provides stable, deterministic pagination.
// No column advertises this sort key: `Profile` is the only sortable column and it sorts
// by `name`, so nothing in the UI misrepresents the default ordering.
// TODO(contract): switch to `updated_at` once the API exposes that sort key.
const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffProfilesPage = () => {
	const navigate = Route.useNavigate();
	const search = parseTableSearchParams(
		Route.useSearch() as TableSearchParamInput,
	);
	const { t } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTableSearchParams(next),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
	});
	const query = useStaffProfilesQuery({
		q: controller.apiVariables.q,
		sortId: controller.apiVariables.sortId,
		sortOrder: controller.apiVariables.sortOrder,
		cursor: controller.apiVariables.cursor,
		limit: controller.apiVariables.size,
	});
	const rows = toStaffProfileRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const columns = useMemo(() => buildColumns(t), [t]);

	// Entering selection mode discards an uncommitted table-search draft (the
	// search box is locked while rows are selected, so a live draft would sit
	// hidden until exit). Handled inside the selection-change path below rather
	// than a render-side effect — see the no-event-handler React Doctor rule.
	const { resetDraftToCommitted } = controller.search;
	const baseOnSelectionChange = selection.onSelectionChange;
	const onSelectionChange = useCallback(
		(next: TableSelection) => {
			if (!selection.isSelectionMode) {
				resetDraftToCommitted();
			}
			baseOnSelectionChange(next);
		},
		[selection.isSelectionMode, baseOnSelectionChange, resetDraftToCommitted],
	);
	const wrappedSelection = useMemo(
		() => ({ ...selection, onSelectionChange }),
		[selection, onSelectionChange],
	);

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// the DataTable carries the loading/error slots (exempt from QueryDisplay).
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	// A bulk action hit an auth failure mid-session — log out through the
	// same central path as every other surface.
	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div className="publy-page-fill">
			<PageHeader
				title={t('profiles')}
				description={t('staff-profiles-page-description')}
				actions={
					<Link
						to="/staff/profiles/new"
						className={buttonVariants({ variant: 'default' })}
					>
						<IconPlus aria-hidden="true" className="size-[15px]" />
						{t('new-profile')}
					</Link>
				}
			/>
			<DataTable
				testId="staff-profiles-table"
				ariaLabel={t('profiles')}
				columns={columns}
				rows={rows}
				queryState={{
					isPending: query.isPending,
					isError: query.isError,
					onRetry: () => void query.refetch(),
					hasActiveSearch: Boolean(controller.search.committed),
				}}
				pagination={{
					pageIndex: controller.cursor.pageIndex,
					hasPreviousPage: controller.cursor.hasPreviousPage,
					hasNextPage: query.data?.nextCursor != null,
					isPaginationPending: query.isFetching,
					onNextPage: () =>
						controller.cursor.onNextPage(query.data?.nextCursor ?? undefined),
					onPreviousPage: controller.cursor.onPreviousPage,
				}}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				searchPlaceholder={t('search-profiles')}
				selection={wrappedSelection}
				rowHeight={56}
			/>
			{/* ONE selection bar hosts every bulk action (#820 pattern): two
			 * self-bars would stack portalled fixed overlays on top of each
			 * other. */}
			<FloatingSelectionBar
				selectedCount={selection.selectedCount}
				visibleCount={rows.length}
				allVisibleSelected={
					rows.length > 0 && rows.every((row) => selection.rowSelection[row.id])
				}
				onClear={selection.clearSelection}
				onSelectAllVisible={() =>
					selection.onSelectionChange(new Set(rows.map((row) => row.id)))
				}
			>
				<ProfilesListBulkActions
					rows={rows}
					selection={selection}
					onSessionExpired={() => setShouldLogout(true)}
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
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/profiles')({
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-profiles' }],
	},
	validateSearch: (search) =>
		validateTableSearchParams(search as TableSearchParamInput),
	component: StaffProfilesPage,
});
