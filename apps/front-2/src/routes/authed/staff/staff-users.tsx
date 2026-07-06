import { buttonVariants } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import {
	toStaffUserRows,
	type StaffUserRow,
	useStaffUsersQuery,
} from '~/lib/query/staff-users';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';
import { shouldLogoutForFailure } from '~/routes/authed/layout';
const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
// Locked contract default (docs/front-2-migration/parity-contract.md): 100,
// matching the current app and the selectable page-size options.
const DEFAULT_SIZE = 100;

// Name is not backend-sortable (parity contract); Level/Status map 1:1 to sort_id values.
const columns: ColumnDef<StaffUserRow>[] = [
	{
		id: 'name',
		header: 'Name',
		enableSorting: false,
		cell: ({ row }) => (
			<div className="space-y-1">
				<Link
					to={'/staff/staff-users/$userId' as never}
					params={{ userId: row.original.id } as never}
					className="font-medium text-primary underline-offset-4 hover:underline"
				>
					{row.original.displayName}
				</Link>
				<div className="text-xs text-muted">
					{row.original.email || 'No email address'}
				</div>
			</div>
		),
	},
	{
		id: 'level',
		header: 'Level',
		accessorKey: 'level',
		cell: ({ getValue }) => getValue<string | null>() ?? '—',
	},
	{
		id: 'status',
		header: 'Status',
		accessorKey: 'status',
		cell: ({ getValue }) => getValue<string | null>() ?? '—',
	},
	{
		id: 'actions',
		header: 'Actions',
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex justify-end">
				<Link
					to={'/staff/staff-users/$userId' as never}
					params={{ userId: row.original.id } as never}
					className={buttonVariants({ variant: 'secondary', size: 'sm' })}
				>
					View
				</Link>
			</div>
		),
	},
];

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	validateSearch: (search) =>
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffUsersPage,
});

function StaffUsersPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t } = useTranslation('common');

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			// Deliberate cast: the URL contract is snake_case (serializeTableSearchParams),
			// the route's validated search type is camelCase (TableSearchParams) — they are
			// different shapes by design, see docs/guides/front-2/conventions.md#url-state.
			search: serializeTableSearchParams(next) as unknown as TableSearchParams,
			replace: true,
		});
	};

	// apiVariables (incl. the client-only cursor) drives the query; the query's
	// rows drive selection pruning — see use-table-controller.ts's doc comment
	// for why these stay separate hooks instead of one fused controller.
	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
	});
	const query = useStaffUsersQuery(controller.apiVariables);
	const rows = toStaffUserRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));

	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	const hasNextPage = query.data?.nextCursor != null;

	return (
		<div className="space-y-4 p-4">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-xl font-semibold">Staff users</h1>
				<Link
					to={'/staff/invitations/new' as never} // Route is not yet migrated for typed route checks; parity contract keeps this external path.
					className={buttonVariants({ variant: 'primary' })}
				>
					{t('invite-users')}
				</Link>
			</div>
			<DataTable
				testId="staff-users-table"
				ariaLabel="Staff users"
				columns={columns}
				rows={rows}
				isPending={query.isPending}
				isError={query.isError}
				onRetry={() => void query.refetch()}
				hasActiveSearch={Boolean(controller.search.committed)}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				pageIndex={controller.cursor.pageIndex}
				hasPreviousPage={controller.cursor.hasPreviousPage}
				hasNextPage={hasNextPage}
				isPaginationPending={query.isFetching}
				onNextPage={() =>
					controller.cursor.onNextPage(query.data?.nextCursor ?? undefined)
				}
				onPreviousPage={controller.cursor.onPreviousPage}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				selection={selection}
			/>
		</div>
	);
}
