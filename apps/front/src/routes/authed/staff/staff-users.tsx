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
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { PageHeader, StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	toStaffUserRows,
	type StaffUserRow,
	useStaffUsersQuery,
} from '~/lib/query/staff-users';
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
import { StaffListExportSelectedAction } from '~/routes/authed/staff/staff-list-export-selected';
import {
	formatAccountLevelLabel,
	formatStaffStatusLabel,
} from '~/routes/authed/staff/staff-users/status-labels';

import { StaffUserNameCell } from './_staff-user-name-cell';
const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
// Locked contract default (docs/front-migration/parity-contract.md): 100,
// matching the current app and the selectable page-size options.
const DEFAULT_SIZE = 100;

// Name is not backend-sortable (parity contract); Level/Status map 1:1 to sort_id values.
const buildColumns = (
	t: (key: string, options?: Record<string, unknown>) => string,
): ColumnDef<StaffUserRow>[] => [
	{
		id: 'name',
		header: t('common:name'),
		enableSorting: false,
		meta: { headerIcon: <IconUser />, width: '200px', pinWidthAbove: 768 },
		cell: ({ row }) => <StaffUserNameCell row={row.original} />,
	},
	{
		id: 'email',
		header: t('common:email'),
		accessorKey: 'email',
		enableSorting: false,
		meta: { headerIcon: <IconMail />, hideBelow: 768 },
		cell: ({ getValue }) => {
			const email = getValue<string>() || t('common:no-email-address');
			return (
				<span className="block truncate font-normal" title={email}>
					{email}
				</span>
			);
		},
	},
	{
		id: 'level',
		header: t('common:level'),
		accessorKey: 'level',
		meta: { headerIcon: <IconIdBadge2 />, width: '104px', hideBelow: 768 },
		cell: ({ getValue }) => (
			<StatusPill tone="neutral">
				{formatAccountLevelLabel(getValue<string | null>(), t)}
			</StatusPill>
		),
	},
	{
		id: 'status',
		header: t('common:status'),
		accessorKey: 'status',
		meta: { headerIcon: <IconCircleDot />, width: '122px' },
		cell: ({ getValue }) => {
			const status = getValue<string | null>();
			return (
				<StatusPill tone={statusPillTone(status)}>
					{formatStaffStatusLabel(status, t)}
				</StatusPill>
			);
		},
	},
	{
		id: 'actions',
		// Visually chromeless per the handoff, but the columnheader needs an
		// accessible name (axe empty-table-header, parity contract).
		header: () => <span className="sr-only">{t('common:actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<DataTableRowActions
				ariaLabel={t('common:actions-for', {
					name: row.original.displayName,
				})}
				testId={`staff-user-actions-${row.original.id}`}
			>
				<DropdownMenuItem
					render={
						<Link
							to="/staff/staff-users/$userId"
							params={{ userId: row.original.id }}
						/>
					}
				>
					<IconEye />
					{t('common:view-profile')}
				</DropdownMenuItem>
			</DataTableRowActions>
		),
	},
];

const StaffUsersPage = () => {
	const navigate = Route.useNavigate();
	const search = parseTableSearchParams(
		Route.useSearch() as TableSearchParamInput,
	);
	const { t } = useTranslation(['staff-users', 'common']);

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTableSearchParams(next),
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

	const hasNextPage = query.data?.nextCursor != null;

	return (
		<div className="publy-page-fill">
			<PageHeader
				title={t('staff-users-page-title')}
				description={t('staff-users-page-description')}
				actions={
					<Link
						to={'/staff/invitations/new' as never} // Route is not yet migrated for typed route checks; parity contract keeps this external path.
						className={buttonVariants({ variant: 'default' })}
					>
						<IconUserPlus aria-hidden="true" className="size-4" />
						{t('common:invite-users')}
					</Link>
				}
			/>
			<DataTable
				testId="staff-users-table"
				ariaLabel={t('staff-users-page-title')}
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
				searchPlaceholder={t('search-staff-users')}
			/>
			<StaffListExportSelectedAction
				rows={rows}
				selection={selection}
				fileNamePrefix="staff-users"
				columns={[
					{ header: t('common:name'), getValue: (row) => row.displayName },
					{ header: t('common:email'), getValue: (row) => row.email },
					{
						header: t('common:level'),
						getValue: (row) => formatAccountLevelLabel(row.level, t),
					},
					{
						header: t('common:status'),
						getValue: (row) => formatStaffStatusLabel(row.status, t),
					},
				]}
			/>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/staff-users')({
	staticData: {
		i18nNamespaces: ['staff-users'],
		crumbs: () => [{ kind: 'label', labelKey: 'nav-staff-breadcrumb' }],
	},
	validateSearch: (search) =>
		validateTableSearchParams(search as TableSearchParamInput),
	component: StaffUsersPage,
});
