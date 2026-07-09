import {
	IconEye,
	IconId,
	IconPlus,
	IconTextCaption,
	IconUsers,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
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
		header: 'Name',
		accessorKey: 'name',
		meta: { headerIcon: <IconId /> },
		cell: ({ row }) => (
			<Link
				to={'/staff/profiles/$profileId' as never}
				params={{ profileId: row.original.id } as never}
				className="publy-record-link"
			>
				{row.original.name || '—'}
			</Link>
		),
	},
	{
		id: 'description',
		header: 'Description',
		accessorKey: 'description',
		enableSorting: false,
		meta: { headerIcon: <IconTextCaption /> },
		cell: ({ getValue }) => getValue<string | null>() ?? '—',
	},
	{
		id: 'user_account_count',
		header: 'User accounts',
		accessorKey: 'userAccountCount',
		meta: { headerIcon: <IconUsers />, cellClassName: 'w-36' },
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'actions',
		header: '',
		enableSorting: false,
		meta: { cellClassName: 'w-10' },
		cell: ({ row }) => (
			<div className="flex justify-end">
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
						<IconEye />
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
		<div className="publy-page-fill">
			<PageHeader
				title="Staff profiles"
				description="Group permissions into profiles you can assign to staff users."
				actions={
					<Link
						to={'/staff/profiles/new' as never}
						className={buttonVariants({ variant: 'default' })}
					>
						<IconPlus aria-hidden="true" className="size-4" />
						{t('new-item', { item: t('profile').toLowerCase() })}
					</Link>
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
				selection={selection}
			/>
		</div>
	);
}
