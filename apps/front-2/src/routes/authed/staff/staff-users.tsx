import {
	IconCircleDot,
	IconEye,
	IconIdBadge2,
	IconMail,
	IconUser,
	IconUserPlus,
} from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { PageHeader, StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
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
		meta: { headerIcon: <IconUser /> },
		cell: ({ row }) => (
			<div className="flex items-center gap-2.5">
				<InitialsAvatar name={row.original.displayName} />
				<Link
					to={'/staff/staff-users/$userId' as never}
					params={{ userId: row.original.id } as never}
					className="publy-record-link truncate"
				>
					{row.original.displayName}
				</Link>
			</div>
		),
	},
	{
		id: 'email',
		header: 'Email',
		accessorKey: 'email',
		enableSorting: false,
		meta: { headerIcon: <IconMail /> },
		cell: ({ getValue }) => (
			<span className="font-normal">
				{getValue<string>() || 'No email address'}
			</span>
		),
	},
	{
		id: 'level',
		header: 'Level',
		accessorKey: 'level',
		meta: { headerIcon: <IconIdBadge2 />, cellClassName: 'w-28' },
		cell: ({ getValue }) => (
			<StatusPill tone="neutral">
				{getValue<string | null>() ?? 'Unknown'}
			</StatusPill>
		),
	},
	{
		id: 'status',
		header: 'Status',
		accessorKey: 'status',
		meta: { headerIcon: <IconCircleDot />, cellClassName: 'w-32' },
		cell: ({ getValue }) => {
			const status = getValue<string | null>();
			return (
				<StatusPill tone={statusPillTone(status)}>
					{status ?? 'Unknown'}
				</StatusPill>
			);
		},
	},
	{
		id: 'actions',
		header: '',
		enableSorting: false,
		meta: { cellClassName: 'w-10' },
		cell: ({ row }) => (
			<div className="flex justify-end">
				<DataTableRowActions
					ariaLabel={`Actions for ${row.original.displayName}`}
					testId={`staff-user-actions-${row.original.id}`}
				>
					<DropdownMenuItem
						render={
							<Link
								to={'/staff/staff-users/$userId' as never}
								params={{ userId: row.original.id } as never}
							/>
						}
					>
						<IconEye />
						View profile
					</DropdownMenuItem>
				</DataTableRowActions>
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
		<div className="publy-page-fill">
			<PageHeader
				title="Staff users"
				description="Search, review, and manage staff access across the workspace."
				actions={
					<Link
						to={'/staff/invitations/new' as never} // Route is not yet migrated for typed route checks; parity contract keeps this external path.
						className={buttonVariants({ variant: 'default' })}
					>
						<IconUserPlus aria-hidden="true" className="size-4" />
						{t('invite-users')}
					</Link>
				}
			/>
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
				searchPlaceholder="Search by name, email, or role…"
			/>
		</div>
	);
}
