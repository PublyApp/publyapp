import { IconLink, IconUserMinus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import {
	BulkActionsMenu,
	BulkActionsTrigger,
} from '~/components/ui/bulk-actions-trigger';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenu } from '~/components/ui/dropdown-menu';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	globalTenantUserCompaniesQueryOptions,
	invalidateGlobalTenantUsers,
	toGlobalTenantUserBulkUnlinkSummary,
	toGlobalTenantUserCompanyRows,
	useBulkUnlinkGlobalTenantUserCompaniesMutation,
	useGlobalTenantUserCompaniesQuery,
} from '~/lib/query/staff-global-tenant-users';
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
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { LinkCompaniesDrawerHost } from './$userId-organizations-drawer';
import { tenantUserDetailsCrumbs } from './_crumbs';
import { TenantUserDetailsShell } from './_details-shell';
import { buildOrganizationColumns } from './_organizations-columns';

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
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
		preload: ({ params }) => [
			{
				options: globalTenantUserCompaniesQueryOptions,
				variables: {
					userId: params.userId,
					q: '',
					sortId: 'tenant_name',
					sortOrder: 'asc',
					size: 100,
				},
			},
		],
		crumbs: tenantUserDetailsCrumbs,
	},
	validateSearch: (search) =>
		validateTableSearchParams(search as TableSearchParamInput),
	component: TenantUserOrganizationsTabPage,
});

const DEFAULT_SORT = { id: 'tenant_name', order: 'asc' as const };
// Locked parity default (docs/records/2026-07-29-spec-front-parity-contract.md).
const DEFAULT_SIZE = 100;

type OrganizationRow = ReturnType<typeof toGlobalTenantUserCompanyRows>[number];

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
const OrganizationsTabContent = ({ userId }: { userId: string }) => {
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

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
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

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
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

	// Hoisted so the fatal gate and the table props read plain locals.
	const companiesError = query.error;
	const companiesIsPending = query.isPending;
	const companiesIsError = query.isError;

	if (companiesError !== null && shouldLogoutForFailure(companiesError)) {
		return <LogoutRedirect />;
	}

	return (
		<>
			<DataTable
				testId="tenant-user-companies-table"
				ariaLabel={t('companies')}
				columns={columns}
				rows={rows}
				queryState={{
					isPending: companiesIsPending,
					isError: companiesIsError,
					onRetry: () => void query.refetch(),
					hasActiveSearch: Boolean(controller.search.committed),
				}}
				pagination={{
					pageIndex: controller.cursor.pageIndex,
					hasPreviousPage: controller.cursor.hasPreviousPage,
					hasNextPage: query.data?.nextCursor != null,
					isPaginationPending: query.isFetching,
					onNextPage: () =>
						controller.cursor.onNextPage(query.data?.nextCursor ?? undefined),
					onPreviousPage: controller.cursor.onPreviousPage,
				}}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
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

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
const OrganizationsBulkActions = ({
	userId,
	rows,
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

	// #1604 — derive selectedIds from the visible rows list, not from the
	// raw selection map. `useRowSelection`'s prune effect runs after the
	// next render, so iterating the map directly can include ids for rows
	// that just left the view — those would be sent as stale bulk targets.
	// Filtering the visible rows keeps the contract tight: every id is
	// something the user can currently see, and the prune window cannot
	// leak a target the server no longer has on this page.
	//
	// Single pass (react-doctor/js-combine-iterations): no chained
	// filter+map. The loop pushes `row.id` for every visible row that is
	// selected, preserving both the visibility filter and the projection.
	const selectedIds: string[] = [];
	for (const row of rows) {
		if (selection.rowSelection[row.id]) {
			selectedIds.push(row.id);
		}
	}
	const isOverLimit = selectedIds.length > BULK_ACTION_MAX_COUNT;

	const confirmRemoveSelectedOrganizations = async () => {
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
					t('bulk-action-rows-may-leave-filter'),
				);
				return;
			}

			// Only hint that rows may leave the filtered view when at least
			// one row actually changed state. On a total failure
			// (succeededCount === 0) nothing left the view, so the hint
			// would contradict the leading count message.
			toastLocalMutationResult.error(
				t('tenant-user-company-bulk-remove-partial-success', {
					succeeded: summary.succeededCount,
					failed: summary.failedCount,
				}),
				summary.succeededCount > 0
					? t('bulk-action-rows-may-leave-filter')
					: undefined,
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
	};

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<>
			<DropdownMenu>
				<BulkActionsTrigger
					triggerLabel={t('bulk-actions')}
					isOverLimit={isOverLimit}
					overLimitMessage={t('bulk-action-max-count-exceeded', {
						max: BULK_ACTION_MAX_COUNT,
						count: selectedIds.length,
					})}
				/>
				<BulkActionsMenu
					items={[
						{
							key: 'remove',
							label: t('remove-selected-organizations'),
							icon: <IconUserMinus />,
							variant: 'destructive',
							disabled: bulkUnlink.isPending,
						},
					]}
					onMenuItemClick={() => {
						setOpen(true);
					}}
				/>
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
					void confirmRemoveSelectedOrganizations();
				}}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
				}}
			/>
		</>
	);
};
