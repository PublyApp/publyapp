import {
	IconBriefcase,
	IconEye,
	IconKey,
	IconPlus,
	IconTextCaption,
	IconUsers,
} from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo } from 'react';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { PageHeader } from '~/components/ui/product-page';
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
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconBriefcase className="size-3.5 text-muted-foreground" />
				<span>Profile</span>
			</div>
		),
		accessorKey: 'name',
		cell: ({ row }) => (
			<Link
				to={'/staff/profiles/$profileId' as never}
				params={{ profileId: row.original.id } as never}
				className="flex items-center gap-[11px] min-w-0 no-underline"
			>
				<span
					className="publy-profile-icon-tile"
					style={
						{
							'--publy-icon-tile-bg': row.original.iconBg,
							'--publy-icon-tile-fg': row.original.iconFg,
						} as React.CSSProperties
					}
				>
					<i className={`ti ti-${row.original.icon}`} />
				</span>
				<span className="text-[13px] font-medium truncate">
					{row.original.name || '—'}
				</span>
			</Link>
		),
	},
	{
		id: 'description',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconTextCaption className="size-3.5 text-muted-foreground" />
				<span>Description</span>
			</div>
		),
		accessorKey: 'description',
		enableSorting: false,
		cell: ({ getValue }) => {
			const value = getValue<string | null>();
			return <span className="truncate block text-[13px]">{value ?? '—'}</span>;
		},
	},
	{
		id: 'members',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconUsers className="size-3.5 text-muted-foreground" />
				<span>Members</span>
			</div>
		),
		accessorKey: 'userAccountCount',
		enableSorting: false,
		cell: ({ getValue }) => (
			<span className="text-[13px] font-medium">{getValue<number>()}</span>
		),
	},
	{
		id: 'permissions',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconKey className="size-3.5 text-muted-foreground" />
				<span>Permissions</span>
			</div>
		),
		enableSorting: false,
		cell: () => (
			<span className="text-[13px] text-muted-foreground">
				{/* TODO(contract): permission count not in profile list response */}—
			</span>
		),
	},
	{
		id: 'created_at',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<span>Updated</span>
			</div>
		),
		accessorKey: 'createdAt',
		cell: () => (
			<span className="text-[13px] text-muted-foreground">
				{/* TODO(contract): updated_at not in profile list response */}—
			</span>
		),
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">Actions</span>,
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex justify-center">
				<DataTableRowActions
					ariaLabel={`Actions for ${row.original.name || 'profile'}`}
					testId={`staff-profile-actions-${row.original.id}`}
				>
					<DropdownMenuItem
						render={
							<Link
								to={'/staff/profiles/$profileId' as never}
								params={{ profileId: row.original.id } as never}
							/>
						}
					>
						<IconEye className="size-[15px]" />
						View profile
					</DropdownMenuItem>
				</DataTableRowActions>
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

	const totalCount = useMemo(() => rows.length, [rows]);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	return (
		<div className="publy-page-fill">
			<PageHeader
				title="Profiles"
				description="Profiles bundle permissions and can be assigned to staff and tenants."
				actions={
					<div className="flex items-center gap-2.5">
						{totalCount > 0 ? (
							<span className="publy-profile-count-badge">{totalCount}</span>
						) : null}
						<Link
							to={'/staff/profiles/new' as never}
							className={buttonVariants({ variant: 'default' })}
						>
							<IconPlus aria-hidden="true" className="size-[15px]" />
							New profile
						</Link>
					</div>
				}
			/>
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
				searchPlaceholder="Search profiles…"
				selection={selection}
				rowHeight={56}
			/>
		</div>
	);
}
