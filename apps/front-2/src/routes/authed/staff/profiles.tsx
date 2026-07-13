import {
	IconBriefcase,
	IconBuildingBank,
	IconCalendar,
	IconChartBar,
	IconEye,
	IconNews,
	IconPlus,
	IconSettings,
	IconShield,
	IconTextCaption,
	IconUsers,
	IconWorld,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo } from 'react';
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

// Default server ordering by creation date provides stable, deterministic pagination.
// No column advertises this sort key: `Profile` is the only sortable column and it sorts
// by `name`, so nothing in the UI misrepresents the default ordering.
// TODO(contract): switch to `updated_at` once the API exposes that sort key.
const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const PROFILE_ICON_MAP: Record<string, Icon> = {
	news: IconNews,
	calendar: IconCalendar,
	shield: IconShield,
	'building-bank': IconBuildingBank,
	users: IconUsers,
	settings: IconSettings,
	'chart-bar': IconChartBar,
	world: IconWorld,
};

const buildColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
): ColumnDef<StaffProfileRow>[] => [
	{
		id: 'name',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconBriefcase className="size-3.5 text-muted-foreground" />
				<span>{t('profile')}</span>
			</div>
		),
		accessorKey: 'name',
		meta: { width: '240px', pinWidthAbove: 768 },
		cell: ({ row }) => {
			const IconComponent = PROFILE_ICON_MAP[row.original.icon];
			const name = row.original.name;
			return (
				<Link
					to={'/staff/profiles/$profileId' as never}
					params={{ profileId: row.original.id } as never}
					className="flex items-center gap-[11px] min-w-0 no-underline"
				>
					<span
						className="publy-profile-icon-tile"
						data-tone={row.original.iconTone}
					>
						{IconComponent ? <IconComponent className="size-[17px]" /> : null}
					</span>
					<span
						className="publy-record-link min-w-0 truncate text-[13px]"
						title={name || undefined}
					>
						{name || t('profile')}
					</span>
				</Link>
			);
		},
	},
	{
		id: 'description',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconTextCaption className="size-3.5 text-muted-foreground" />
				<span>{t('description')}</span>
			</div>
		),
		accessorKey: 'description',
		enableSorting: false,
		meta: { hideBelow: 768 },
		cell: ({ getValue }) => {
			const value = getValue<string | null>();
			if (!value) {
				return null;
			}
			return (
				<span className="block truncate text-[13px]" title={value}>
					{value}
				</span>
			);
		},
	},
	{
		id: 'members',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconUsers className="size-3.5 text-muted-foreground" />
				<span>{t('members')}</span>
			</div>
		),
		accessorKey: 'userAccountCount',
		enableSorting: false,
		meta: { width: '104px', hideBelow: 768 },
		cell: ({ getValue }) => {
			const value = getValue<number | null>();
			if (value === null) {
				return null;
			}
			return <span className="text-[13px] font-medium">{value}</span>;
		},
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<DataTableRowActions
				ariaLabel={t('actions-for', {
					name: row.original.name || t('profile'),
				})}
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
					{t('view-profile')}
				</DropdownMenuItem>
			</DataTableRowActions>
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
	const columns = useMemo(() => buildColumns(t), [t]);

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
				title={t('profiles')}
				description={t('staff-profiles-page-description')}
				count={
					rows.length > 0 ? (
						<span className="publy-profile-count-badge">{rows.length}</span>
					) : null
				}
				actions={
					<Link
						to={'/staff/profiles/new' as never}
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
				searchPlaceholder={t('search-profiles')}
				selection={selection}
				rowHeight={56}
			/>
		</div>
	);
}
