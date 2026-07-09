import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button';
import {
	type StaffProfileRow,
	toStaffProfileRows,
	useStaffProfilesQuery,
} from '~/lib/query/staff-profiles';
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
const DEFAULT_SIZE = 100;

const columns: ColumnDef<StaffProfileRow>[] = [
	{
		id: 'name',
		header: 'Name',
		accessorKey: 'name',
		cell: ({ row }) => (
			<div className="space-y-1">
				<Link
					to={'/staff/profiles/$profileId' as never}
					params={{ profileId: row.original.id } as never}
					className="font-medium text-primary underline-offset-4 hover:underline"
				>
					{row.original.name || '—'}
				</Link>
				<p className="text-xs text-foreground-500">
					{row.original.description ?? 'No description provided.'}
				</p>
			</div>
		),
	},
	{
		id: 'description',
		header: 'Description',
		accessorKey: 'description',
		enableSorting: false,
		cell: ({ getValue }) => getValue<string | null>() ?? '—',
	},
	{
		id: 'user_account_count',
		header: 'User accounts',
		accessorKey: 'userAccountCount',
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'actions',
		header: 'Actions',
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex justify-end">
				<Link
					to={'/staff/profiles/$profileId' as never}
					params={{ profileId: row.original.id } as never}
					className={buttonVariants({ variant: 'secondary', size: 'sm' })}
				>
					View
				</Link>
			</div>
		),
	},
];

export const Route = createFileRoute('/_authed-layout/staff/profiles')({
	validateSearch: (search) =>
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffProfilesPage,
});

function StaffProfilesPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t } = useTranslation('common');

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTableSearchParams(next) as unknown as TableSearchParams,
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

	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-4 p-4">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-xl font-semibold">Staff profiles</h1>
				<Link
					to={'/staff/profiles/new' as never}
					className={buttonVariants({ variant: 'default' })}
				>
					{t('new-item', { item: t('profile').toLowerCase() })}
				</Link>
			</div>
			<DataTable
				testId="staff-profiles-table"
				ariaLabel="Staff profiles"
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
				hasNextPage={query.data?.nextCursor != null}
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
