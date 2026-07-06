import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import {
	type StaffTenantRow,
	toStaffTenantRows,
	useStaffTenantsQuery,
} from '~/lib/query/staff-tenants';
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

const getStatusClassName = (status: string | null): string => {
	switch (status) {
		case 'Active':
			return 'border-success-200 bg-success-50 text-success-800';
		case 'Pending':
			return 'border-warning-200 bg-warning-50 text-warning-800';
		case 'Suspended':
			return 'border-danger-200 bg-danger-50 text-danger-800';
		default:
			return 'border-default-200 bg-default-100 text-foreground';
	}
};

const columns: ColumnDef<StaffTenantRow>[] = [
	{
		id: 'name',
		header: 'Name',
		accessorKey: 'name',
		cell: ({ row }) => (
			<div className="space-y-1">
				<a
					href={`/staff/tenants/${row.original.id}`}
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					{row.original.name}
				</a>
			</div>
		),
	},
	{
		id: 'status',
		header: 'Status',
		accessorKey: 'status',
		cell: ({ row }) => {
			const status = row.original.status;
			if (!status) {
				return '—';
			}

			return (
				<span
					className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusClassName(status)}`}
				>
					{status}
				</span>
			);
		},
	},
	{
		id: 'users_count',
		header: 'Users',
		accessorKey: 'usersCount',
		enableSorting: false,
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'max_users',
		header: 'Max users',
		accessorKey: 'maxUsers',
		enableSorting: false,
		cell: ({ getValue }) => String(getValue<number>()),
	},
];

export const Route = createFileRoute('/_authed-layout/staff/tenants')({
	validateSearch: (search) =>
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffTenantsPage,
});

function StaffTenantsPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();

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
	const query = useStaffTenantsQuery(controller.apiVariables);
	const rows = toStaffTenantRows(query.data?.data);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	return (
		<div className="space-y-4 p-4">
			<h1 className="text-xl font-semibold">Tenants</h1>
			<DataTable
				testId="staff-tenants-table"
				ariaLabel="Staff tenants"
				columns={columns}
				rows={rows}
				isPending={query.isPending}
				isError={query.isError}
				onRetry={() => void query.refetch()}
				errorContent="Unable to load tenants right now."
				emptyContent="No tenants found."
				noMatchContent="No tenants match your search."
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
			/>
		</div>
	);
}
