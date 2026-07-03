import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect } from 'react';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { useStaffUsersQuery } from '~/lib/query/staff-users';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import type { StaffUserItem } from '@org/client-ts/src/models/index.js';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 25;

type StaffUserRow = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	level: string | null;
	status: string | null;
};

const toRows = (items: StaffUserItem[] | null | undefined): StaffUserRow[] => {
	const list = items ?? [];
	const rows: StaffUserRow[] = [];

	for (const item of list) {
		if (typeof item.id !== 'string' || item.id.length === 0) {
			continue;
		}

		rows.push({
			id: item.id,
			email: item.email ?? '',
			firstName: item.firstName ?? null,
			lastName: item.lastName ?? null,
			level: item.level ?? null,
			status: item.status ?? null,
		});
	}

	return rows;
};

const formatFullName = (row: StaffUserRow): string => {
	const firstName = row.firstName?.trim() ?? '';
	const lastName = row.lastName?.trim() ?? '';
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName.length > 0 ? fullName : row.email || '—';
};

// Name is not backend-sortable (parity contract); Level/Status map 1:1 to sort_id values.
const columns: ColumnDef<StaffUserRow>[] = [
	{
		id: 'name',
		header: 'Name',
		enableSorting: false,
		cell: ({ row }) => (
			<div>
				<div>{formatFullName(row.original)}</div>
				<div className="text-xs text-muted">{row.original.email}</div>
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
];

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	validateSearch: (search) =>
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffUsersPage,
});

function StaffUsersPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();

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
	const rows = toRows(query.data?.data);
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
			<h1 className="text-xl font-semibold">Staff users</h1>
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
