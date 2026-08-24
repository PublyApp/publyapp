import { IconChevronDown, IconLink, IconUserMinus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import {
	FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME,
	FloatingSelectionBar,
} from '~/components/table/floating-selection-bar';
import { DataTableRowActions } from '~/components/table/row-actions';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { BrandTile } from '~/components/ui/initials-avatar';
import { formatDateTime } from '~/lib/format-date-time';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	invalidateGlobalTenantUsers,
	toGlobalTenantUserBulkUnlinkSummary,
	toGlobalTenantUserCompanyRows,
	useBulkUnlinkGlobalTenantUserCompaniesMutation,
	useGlobalTenantUserCompaniesQuery,
} from '~/lib/query/staff-global-tenant-users';
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

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import { formatAccountLevelLabel } from '../staff-users/status-labels';
import { formatTenantStatusLabel } from '../tenants/$tenantId/_tenant-details-shell';
import { LinkCompaniesDrawerHost } from './$userId-organizations-drawer';
import { tenantUserDetailsCrumbs } from './_crumbs';
import { TenantUserDetailsShell } from './_details-shell';

const TenantUserOrganizationsTabPage = () => {
	const { userId } = Route.useParams();

	return (
		<TenantUserDetailsShell userId={userId} activeTab="organizations">
			<OrganizationsTabContent userId={userId} />
		</TenantUserDetailsShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenant-users/details/$userId/organizations',
)({
	staticData: {
		i18nNamespaces: ['common'],
		crumbs: tenantUserDetailsCrumbs,
	},
	validateSearch: (search) =>
		validateTableSearchParams(search as TableSearchParamInput),
	component: TenantUserOrganizationsTabPage,
});

const DEFAULT_SORT = { id: 'tenant_name', order: 'asc' as const };
// Locked parity default (docs/front-migration/parity-contract.md).
const DEFAULT_SIZE = 100;

type OrganizationRow = ReturnType<typeof toGlobalTenantUserCompanyRows>[number];

export const OrganizationsTabContent = ({ userId }: { userId: string }) => {
	const { t } = useTranslation('common');
	const [isLinkDrawerOpen, setLinkDrawerOpen] = useState(false);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<CompanyCountLabel userId={userId} />
				<Button
					type="button"
					onClick={() => {
						setLinkDrawerOpen(true);
					}}
					data-testid="link-companies-button"
				>
					<IconLink aria-hidden="true" className="size-4" />
					{t('link-companies')}
				</Button>
			</div>
			<OrganizationsTable userId={userId} />
			<LinkCompaniesDrawerHost
				userId={userId}
				isOpen={isLinkDrawerOpen}
				onOpenChange={setLinkDrawerOpen}
			/>
		</div>
	);
};

const CompanyCountLabel = ({ userId }: { userId: string }) => {
	const { t } = useTranslation('common');
	const query = useGlobalTenantUserCompaniesQuery({
		userId,
		sortId: DEFAULT_SORT.id,
		sortOrder: DEFAULT_SORT.order,
		size: 1,
	});
	const rows = toGlobalTenantUserCompanyRows(query.data?.data);

	return (
		<p className="text-sm text-muted-foreground" data-testid="company-count">
			{t('company-count', { count: rows.length })}
		</p>
	);
};

const OrganizationsTable = ({ userId }: { userId: string }) => {
	const { t, i18n } = useTranslation('common');
	const navigate = Route.useNavigate();
	const rawSearch = Route.useSearch() as TableSearchParamInput;

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({ search: serializeTableSearchParams(next), replace: true });
	};

	const search = parseTableSearchParams(rawSearch);
	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
	});
	const query = useGlobalTenantUserCompaniesQuery({
		userId,
		q: controller.apiVariables.q,
		sortId: controller.apiVariables.sortId,
		sortOrder: controller.apiVariables.sortOrder,
		cursor: controller.apiVariables.cursor,
		size: controller.apiVariables.size,
	});
	const rows = useMemo(
		() => toGlobalTenantUserCompanyRows(query.data?.data),
		[query.data],
	);
	const selection = useRowSelection(rows.map((row) => row.id));
	const columns = useMemo(
		() => buildOrganizationColumns(t, i18n.language, userId),
		[t, i18n.language, userId],
	);

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
		<>
			<DataTable
				testId="tenant-user-companies-table"
				ariaLabel={t('companies')}
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
				searchPlaceholder={t('search-companies')}
				noMatchTitle={t('no-matching-companies')}
				selection={selection}
			/>
			<FloatingSelectionBar
				selectedCount={selection.selectedCount}
				visibleCount={rows.length}
				allVisibleSelected={false}
				onClear={selection.clearSelection}
				onSelectAllVisible={() =>
					selection.onSelectionChange(new Set(rows.map((row) => row.id)))
				}
			>
				<OrganizationsBulkActions
					userId={userId}
					rows={rows}
					selection={selection}
				/>
			</FloatingSelectionBar>
		</>
	);
};

function buildOrganizationColumns(
	t: (key: string, options?: Record<string, unknown>) => string,
	locale: string,
	userId: string,
): ColumnDef<OrganizationRow>[] {
	return [
		{
			id: 'name',
			header: t('name'),
			accessorKey: 'name',
			meta: { width: '260px' },
			cell: ({ row }) => (
				<div className="flex min-w-0 items-center gap-2.5">
					<BrandTile name={row.original.name} logoUrl={row.original.logoUrl} />
					<span className="truncate font-medium">{row.original.name}</span>
				</div>
			),
		},
		{
			id: 'level',
			header: t('level'),
			accessorKey: 'level',
			meta: { width: '104px', hideBelow: 768 },
			cell: ({ getValue }) => (
				<span className="text-sm">
					{formatAccountLevelLabel(getValue<string | null>(), t)}
				</span>
			),
		},
		{
			id: 'status',
			header: t('status'),
			accessorKey: 'status',
			meta: { width: '140px' },
			cell: ({ getValue }) => (
				<span className="text-sm">
					{formatTenantStatusLabel(getValue<string | null>() ?? '', t)}
				</span>
			),
		},
		{
			id: 'member-since',
			header: t('member-since'),
			accessorKey: 'createdAt',
			meta: { width: '180px', hideBelow: 1024 },
			cell: ({ getValue }) => (
				<span className="text-sm text-muted-foreground">
					{formatDateTime(getValue<Date | null>(), locale)}
				</span>
			),
		},
		{
			id: 'actions',
			header: () => <span className="sr-only">{t('actions')}</span>,
			enableSorting: false,
			meta: { width: '40px', align: 'center' },
			cell: ({ row }) => (
				<DataTableRowActions
					ariaLabel={t('actions-for', { name: row.original.name })}
					testId={`tenant-user-company-actions-${row.original.id}`}
				>
					<ConfirmRemoveSingleOrganization userId={userId} row={row.original} />
				</DataTableRowActions>
			),
		},
	];
}

/** Test seam: the columns builder with explicit translator/locale. */
export const buildOrganizationColumnsForTests = buildOrganizationColumns;

const ConfirmRemoveSingleOrganization = ({
	userId,
	row,
}: {
	userId: string;
	row: OrganizationRow;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isOpen, setOpen] = useState(false);
	const bulkUnlink = useBulkUnlinkGlobalTenantUserCompaniesMutation();
	const [shouldLogout, setShouldLogout] = useState(false);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<ConfirmDialog
			isOpen={isOpen}
			title={t('remove-user-from-tenant')}
			description={t('confirm-remove-user-from-tenant-details')}
			confirmLabel={t('remove')}
			tone="danger"
			isPending={bulkUnlink.isPending}
			onConfirm={() => {
				void (async () => {
					try {
						await bulkUnlink.mutateAsync({ userId, tenantIds: [row.id] });
					} catch (error) {
						setOpen(false);
						if (shouldLogoutForFailure(error)) {
							setShouldLogout(true);
							return;
						}
						await displayLocalMutationFailure(error, t('an-error-occurred'));
						return;
					}
					setOpen(false);
					await invalidateGlobalTenantUsers(queryClient);
					toastLocalMutationResult.success(t('user-removed-success'));
				})();
			}}
			onOpenChange={setOpen}
		/>
	);
};

const OrganizationsBulkActions = ({
	userId,
	selection,
}: {
	userId: string;
	rows: OrganizationRow[];
	selection: ReturnType<typeof useRowSelection>;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isOpen, setOpen] = useState(false);
	const bulkUnlink = useBulkUnlinkGlobalTenantUserCompaniesMutation();
	const [shouldLogout, setShouldLogout] = useState(false);

	// Single pass (react-doctor/js-combine-iterations): no chained filter+map.
	const selectedIds: string[] = [];
	for (const [id, checked] of Object.entries(selection.rowSelection)) {
		if (checked) {
			selectedIds.push(id);
		}
	}
	const isOverLimit = selectedIds.length > BULK_ACTION_MAX_COUNT;

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={isOverLimit}
							title={
								isOverLimit
									? t('bulk-action-max-count-exceeded', {
											max: BULK_ACTION_MAX_COUNT,
											count: selectedIds.length,
										})
									: t('more-actions')
							}
							aria-label={t('more-actions')}
							className={FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME}
						/>
					}
				>
					{t('bulk-actions')}
					<IconChevronDown aria-hidden="true" className="size-3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" side="top" sideOffset={6}>
					<DropdownMenuItem
						variant="destructive"
						disabled={bulkUnlink.isPending}
						onClick={() => {
							setOpen(true);
						}}
					>
						<IconUserMinus />
						{t('remove-selected-organizations')}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={isOpen}
				title={t('remove-selected-organizations')}
				description={t('confirm-bulk-remove-tenant-user-companies', {
					count: selectedIds.length,
				})}
				confirmLabel={t('remove')}
				tone="danger"
				isPending={bulkUnlink.isPending}
				onConfirm={() => {
					void (async () => {
						try {
							const result = await bulkUnlink.mutateAsync({
								userId,
								tenantIds: selectedIds,
							});
							const summary = toGlobalTenantUserBulkUnlinkSummary(result);
							setOpen(false);
							selection.clearSelection();
							await invalidateGlobalTenantUsers(queryClient);

							if (summary.failedCount === 0) {
								toastLocalMutationResult.success(
									t('tenant-user-company-bulk-remove-success', {
										count: summary.succeededCount,
									}),
								);
								return;
							}

							toastLocalMutationResult.error(
								t('tenant-user-company-bulk-remove-partial-success', {
									succeeded: summary.succeededCount,
									failed: summary.failedCount,
								}),
							);
						} catch (error) {
							setOpen(false);
							if (shouldLogoutForFailure(error)) {
								setShouldLogout(true);
								return;
							}
							await displayLocalMutationFailure(
								error,
								t('tenant-user-company-bulk-remove-failure'),
							);
						}
					})();
				}}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
				}}
			/>
		</>
	);
};
