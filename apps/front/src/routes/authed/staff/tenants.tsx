import {
	IconBuilding,
	IconChevronDown,
	IconCircleDot,
	IconPlayerPause,
	IconPlus,
	IconRefresh,
	IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import {
	DataTable,
	SELECTION_LOCKED_TITLE_KEY,
} from '~/components/table/data-table';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { DataTableRowActions } from '~/components/table/row-actions';
import {
	useRowSelection,
	type UseRowSelectionResult,
} from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import {
	type BulkActionMenuItem,
	BulkActionsMenu,
	BulkActionsTrigger,
} from '~/components/ui/bulk-actions-trigger';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { PageHeader, StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	invalidateStaffTenants,
	type StaffTenantRow,
	toStaffTenantRows,
	useBulkDeleteStaffTenantsMutation,
	useBulkReactivateStaffTenantsMutation,
	useBulkSuspendStaffTenantsMutation,
	useDeleteStaffTenantMutation,
	useReactivateStaffTenantMutation,
	useStaffTenantsQuery,
	useSuspendStaffTenantMutation,
} from '~/lib/query/staff-tenants';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	parseTenantListSearchParams,
	serializeTenantListSearchParams,
	serializeTenantStatusFilter,
	TENANT_STATUS_FILTERS,
	validateTenantListSearchParams,
	type TenantListSearchParamInput,
	type TenantListSearchParams,
	type TenantStatusFilter,
} from './tenants-list-helpers';
import { formatTenantStatusLabel } from './tenants/$tenantId/_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const TENANT_STATUS_ACTIVE = 'Active';
const TENANT_STATUS_SUSPENDED = 'Suspended';

const formatTenantStatusFilterLabel = (
	statuses: readonly TenantStatusFilter[],
	t: (key: string) => string,
): string => {
	if (statuses.length === 0) {
		return t('all-statuses');
	}
	return statuses
		.map((status) => {
			if (status === 'pending') return t('status-pending');
			if (status === 'active') return t('status-active');
			return t('status-suspended');
		})
		.join(', ');
};

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
const TenantStatusFilterMenu = ({
	value,
	onChange,
	disabled,
}: {
	value: readonly TenantStatusFilter[];
	onChange: (next: TenantStatusFilter[]) => void;
	disabled?: boolean;
}) => {
	const { t } = useTranslation('common');
	const label = formatTenantStatusFilterLabel(value, t);
	const selected = new Set(value);

	const toggleStatus = (status: TenantStatusFilter): void => {
		onChange(
			selected.has(status)
				? value.filter((item) => item !== status)
				: TENANT_STATUS_FILTERS.filter(
						(item) => selected.has(item) || item === status,
					),
		);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="outline"
						className="publy-data-table-filter-button max-w-64 text-[13px]"
						data-testid="staff-tenants-table-status-filter-trigger"
						disabled={disabled}
						title={disabled ? t(SELECTION_LOCKED_TITLE_KEY) : undefined}
					/>
				}
			>
				<IconCircleDot
					aria-hidden="true"
					className="size-[15px] text-[var(--publy-foreground-secondary)]"
				/>
				<span className="truncate">{label}</span>
				<IconChevronDown aria-hidden="true" className="size-3" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={6}>
				<DropdownMenuCheckboxItem
					checked={value.length === 0}
					closeOnClick
					data-testid="staff-tenants-table-status-filter-all"
					onCheckedChange={() => onChange([])}
				>
					{t('all-statuses')}
				</DropdownMenuCheckboxItem>
				{TENANT_STATUS_FILTERS.map((status) => (
					<DropdownMenuCheckboxItem
						key={status}
						checked={selected.has(status)}
						closeOnClick={false}
						showCheckbox
						data-testid={`staff-tenants-table-status-filter-${status}`}
						onCheckedChange={() => toggleStatus(status)}
					>
						{formatTenantStatusFilterLabel([status], t)}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

const buildTenantColumns = (
	onSessionExpired: () => void,
	t: (key: string) => string,
): ColumnDef<StaffTenantRow>[] => [
	{
		id: 'name',
		header: t('name'),
		accessorKey: 'name',
		meta: { headerIcon: <IconBuilding /> },
		cell: ({ row }) => (
			<Link
				to="/staff/tenants/$tenantId"
				params={{ tenantId: row.original.id }}
				className="flex min-w-0 items-center gap-2.5 no-underline"
			>
				<PersonAvatar
					name={row.original.name}
					avatarUrl={row.original.logoUrl}
				/>
				<span
					className="publy-record-link min-w-0 truncate"
					title={row.original.name}
				>
					{row.original.name}
				</span>
			</Link>
		),
	},
	{
		id: 'status',
		header: t('status'),
		accessorKey: 'status',
		meta: { headerIcon: <IconCircleDot />, width: '124px' },
		cell: ({ row }) => {
			const status = row.original.status;
			if (!status) {
				return '—';
			}

			return (
				<StatusPill tone={statusPillTone(status)}>
					{formatTenantStatusLabel(status, t)}
				</StatusPill>
			);
		},
	},
	{
		id: 'users_count',
		header: t('users'),
		accessorKey: 'usersCount',
		enableSorting: false,
		meta: { width: '92px', hideBelow: 768 },
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'projects_count',
		header: t('projects'),
		accessorKey: 'projectsCount',
		enableSorting: false,
		meta: { width: '92px', hideBelow: 1024 },
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'max_users',
		header: t('max-users-column'),
		accessorKey: 'maxUsers',
		enableSorting: false,
		meta: { width: '132px', hideBelow: 768 },
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'actions',
		// Visually chromeless per the handoff, but the columnheader needs an
		// accessible name (axe empty-table-header, parity contract).
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<TenantLifecycleActionsCell
				tenant={row.original}
				onSessionExpired={onSessionExpired}
			/>
		),
	},
];

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
const StaffTenantsPage = () => {
	const [shouldLogout, setShouldLogout] = useState(false);
	const navigate = Route.useNavigate();
	const search = parseTenantListSearchParams(
		Route.useSearch() as TenantListSearchParamInput,
	);
	const { t } = useTranslation('common');

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTenantListSearchParams(next as TenantListSearchParams),
			replace: true,
		});
	};

	const setStatusFilter = (next: TenantStatusFilter[]): void => {
		void navigate({
			search: serializeTenantListSearchParams({
				...search,
				status: next,
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const serializedStatus = serializeTenantStatusFilter(search.status);
	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: serializedStatus ?? '',
	});
	const query = useStaffTenantsQuery({
		...controller.apiVariables,
		status: serializedStatus,
	});
	const rows = toStaffTenantRows(query.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));

	// tenants-r6-F2: freeze the destructive selection target set — a pending
	// search debounce or a still-clickable status filter can silently swap
	// out which rows a bulk action will hit after the user has already
	// selected them. Cancel the pending search commit the moment selection
	// mode starts (mirrors invitations/index.tsx, staff-users.tsx,
	// profiles.tsx); the status filter trigger below is disabled for the
	// same reason.
	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	const onSessionExpired = useCallback(() => setShouldLogout(true), []);
	const columns = useMemo(
		() => buildTenantColumns(onSessionExpired, t),
		[onSessionExpired, t],
	);

	// Hoisted so the fatal-error gate reads a plain local, not a query flag —
	// the DataTable carries the loading/error slots (exempt from QueryDisplay).
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	return (
		<div className="publy-page-fill">
			<PageHeader
				title={t('tenants')}
				description={t('tenants-list-description')}
				actions={
					<Link
						to="/staff/tenants/new"
						className={buttonVariants({ variant: 'default' })}
					>
						<IconPlus aria-hidden="true" className="size-4" />
						{t('new-item', { item: t('tenant') })}
					</Link>
				}
			/>
			<DataTable
				testId="staff-tenants-table"
				ariaLabel={t('staff-tenants-table-aria-label')}
				columns={columns}
				rows={rows}
				queryState={{
					isPending: query.isPending,
					isError: query.isError,
					onRetry: () => void query.refetch(),
					hasActiveSearch: Boolean(
						controller.search.committed || search.status.length > 0,
					),
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
				getRowLabel={(row) => row.name}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				selection={selection}
				toolbarEnd={
					<TenantStatusFilterMenu
						value={search.status}
						onChange={setStatusFilter}
						disabled={selection.isSelectionMode}
					/>
				}
			/>
			<FloatingSelectionBar
				selectedCount={selection.selectedCount}
				visibleCount={rows.length}
				allVisibleSelected={
					rows.length > 0 && rows.every((row) => selection.rowSelection[row.id])
				}
				onClear={selection.clearSelection}
				onSelectAllVisible={() =>
					selection.onSelectionChange(new Set(rows.map((row) => row.id)))
				}
			>
				<TenantBulkActions
					rows={rows}
					selection={selection}
					onSessionExpired={onSessionExpired}
				/>
			</FloatingSelectionBar>
		</div>
	);
};

export const Route = createFileRoute('/_authed-layout/staff/tenants')({
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'nav-tenants' }],
	},
	validateSearch: (search) =>
		validateTenantListSearchParams(search as TenantListSearchParamInput),
	component: StaffTenantsPage,
});

type PendingLifecycleAction = 'suspend' | 'reactivate' | 'delete' | null;

const getConfirmDialogConfig = (
	action: PendingLifecycleAction,
	tenantName: string,
	t: (key: string, options?: Record<string, unknown>) => string,
) => {
	switch (action) {
		case 'suspend':
			return {
				title: t('suspend-tenant'),
				description: t('suspend-tenant-confirm', { name: tenantName }),
				confirmLabel: t('suspend'),
			};
		case 'reactivate':
			return {
				title: t('reactivate-tenant'),
				description: t('reactivate-tenant-confirm', { name: tenantName }),
				confirmLabel: t('reactivate'),
			};
		case 'delete':
			return {
				title: t('confirm-delete-tenant-title'),
				description: t('confirm-delete-tenant-message'),
				confirmLabel: t('delete'),
			};
		default:
			return {
				title: '',
				description: '',
				confirmLabel: '',
			};
	}
};

const getBulkConfirmDialogConfig = (
	action: PendingLifecycleAction,
	count: number,
	t: (key: string, options?: Record<string, unknown>) => string,
) => {
	switch (action) {
		case 'suspend':
			return {
				title: t('bulk-suspend'),
				description: t('bulk-suspend-confirm', { count }),
				confirmLabel: t('suspend'),
			};
		case 'reactivate':
			return {
				title: t('bulk-reactivate'),
				description: t('bulk-reactivate-confirm', { count }),
				confirmLabel: t('reactivate'),
			};
		case 'delete':
			return {
				title: t('bulk-delete'),
				description: t('bulk-delete-confirm', { count }),
				confirmLabel: t('delete'),
			};
		default:
			return { title: '', description: '', confirmLabel: '' };
	}
};

type TenantBulkActionKey = 'suspend' | 'reactivate' | 'delete';

const TENANT_BULK_FAILURE_KEYS = {
	suspend: 'tenant-bulk-suspend-failure',
	reactivate: 'tenant-bulk-reactivate-failure',
	delete: 'tenant-bulk-delete-failure',
} satisfies Record<TenantBulkActionKey, string>;

const TENANT_BULK_SUCCESS_KEYS = {
	suspend: 'tenant-bulk-suspend-success',
	reactivate: 'tenant-bulk-reactivate-success',
	delete: 'tenant-bulk-delete-success',
} satisfies Record<TenantBulkActionKey, string>;

const TENANT_BULK_PARTIAL_SUCCESS_KEYS = {
	suspend: 'tenant-bulk-suspend-partial-success',
	reactivate: 'tenant-bulk-reactivate-partial-success',
	delete: 'tenant-bulk-delete-partial-success',
} satisfies Record<TenantBulkActionKey, string>;

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
const TenantBulkActions = ({
	rows,
	selection,
	onSessionExpired,
}: {
	rows: StaffTenantRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<PendingLifecycleAction>(null);
	const bulkSuspendMutation = useBulkSuspendStaffTenantsMutation();
	const bulkReactivateMutation = useBulkReactivateStaffTenantsMutation();
	const bulkDeleteMutation = useBulkDeleteStaffTenantsMutation();

	const selectedTenants = rows.filter((row) => selection.rowSelection[row.id]);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const isActionPending =
		bulkSuspendMutation.isPending ||
		bulkReactivateMutation.isPending ||
		bulkDeleteMutation.isPending;

	const eligibleIdsFor = (action: PendingLifecycleAction): string[] => {
		if (action === 'suspend') {
			return selectedTenants.flatMap((tenant) =>
				tenant.status === TENANT_STATUS_ACTIVE ? [tenant.id] : [],
			);
		}
		if (action === 'reactivate') {
			return selectedTenants.flatMap((tenant) =>
				tenant.status === TENANT_STATUS_SUSPENDED ? [tenant.id] : [],
			);
		}
		if (action === 'delete') {
			const allSelectedAreSuspended =
				selectedTenants.length > 0 &&
				selectedTenants.every(
					(tenant) => tenant.status === TENANT_STATUS_SUSPENDED,
				);
			if (allSelectedAreSuspended) {
				return selectedTenants.map((tenant) => tenant.id);
			}
			return [];
		}
		return [];
	};

	const ineligibleMessageFor = (action: PendingLifecycleAction): string => {
		if (action === 'suspend') {
			return t('bulk-suspend-disabled-no-active-tenants');
		}
		if (action === 'reactivate') {
			return t('bulk-reactivate-disabled-no-suspended-tenants');
		}
		return t('bulk-delete-disabled-until-all-tenants-suspended');
	};

	// MenuItems render unconditionally (docs/guides/bulk-action-ux-conventions.md):
	// the click handler enforces eligibility and surfaces the reason
	// rather than disabling or hiding the item.
	const handleMenuItemClick = (action: PendingLifecycleAction) => {
		if (eligibleIdsFor(action).length === 0) {
			toastLocalMutationResult.warning(ineligibleMessageFor(action));
			return;
		}
		setPendingAction(action);
	};

	const performBulkAction = async (action: TenantBulkActionKey) => {
		const eligibleIds = eligibleIdsFor(action);

		let result;
		try {
			if (action === 'suspend') {
				result = await bulkSuspendMutation.mutateAsync({
					tenantIds: eligibleIds,
				});
			} else if (action === 'reactivate') {
				result = await bulkReactivateMutation.mutateAsync({
					tenantIds: eligibleIds,
				});
			} else if (action === 'delete') {
				result = await bulkDeleteMutation.mutateAsync({
					tenantIds: eligibleIds,
				});
			}
		} catch (error) {
			setPendingAction(null);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t(TENANT_BULK_FAILURE_KEYS[action]),
			);
			return;
		}

		setPendingAction(null);
		selection.clearSelection();

		const succeededCount = result?.succeededCount ?? 0;
		const failedCount = result?.failedCount ?? 0;

		if (failedCount > 0) {
			toastLocalMutationResult.error(
				t(TENANT_BULK_PARTIAL_SUCCESS_KEYS[action], {
					succeeded: succeededCount,
					failed: failedCount,
				}),
			);
		} else {
			toastLocalMutationResult.success(
				t(TENANT_BULK_SUCCESS_KEYS[action], { count: succeededCount }),
			);
		}

		await invalidateStaffTenants(queryClient);
	};

	const dialogConfig = getBulkConfirmDialogConfig(
		pendingAction,
		eligibleIdsFor(pendingAction).length,
		t,
	);

	const menuItems: readonly BulkActionMenuItem<TenantBulkActionKey>[] = [
		{ key: 'reactivate', label: t('bulk-reactivate'), icon: <IconRefresh /> },
		{
			key: 'suspend',
			label: t('bulk-suspend'),
			icon: <IconPlayerPause />,
			variant: 'destructive',
			disabled: isActionPending,
		},
		{
			key: 'delete',
			label: t('bulk-delete'),
			icon: <IconTrash />,
			variant: 'destructive',
			disabled: isActionPending,
		},
	];

	return (
		<>
			<DropdownMenu>
				<BulkActionsTrigger
					triggerLabel={t('bulk-actions')}
					isOverLimit={isOverLimit}
					overLimitMessage={t('bulk-action-max-count-exceeded', {
						max: BULK_ACTION_MAX_COUNT,
						count: selectedCount,
					})}
				/>
				<BulkActionsMenu
					items={menuItems}
					onMenuItemClick={handleMenuItemClick}
				/>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={pendingAction !== null}
				title={dialogConfig.title}
				description={dialogConfig.description}
				confirmLabel={dialogConfig.confirmLabel}
				isPending={isActionPending}
				onConfirm={() => {
					if (pendingAction) {
						void performBulkAction(pendingAction);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingAction(null);
				}}
			/>
		</>
	);
};

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- pre-existing develop multi-component route file; surfaced by the #1554 merge only because it mechanically updated this file's imports. Not introduced by this lane. Follow-up: split into single-component route files.
const TenantLifecycleActionsCell = ({
	tenant,
	onSessionExpired,
}: {
	tenant: StaffTenantRow;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<PendingLifecycleAction>(null);
	const suspendTenantMutation = useSuspendStaffTenantMutation();
	const reactivateTenantMutation = useReactivateStaffTenantMutation();
	const deleteTenantMutation = useDeleteStaffTenantMutation();

	const canSuspend = tenant.status === TENANT_STATUS_ACTIVE;
	const canReactivate = tenant.status === TENANT_STATUS_SUSPENDED;
	const canDelete = tenant.status === TENANT_STATUS_SUSPENDED;
	const isActionPending =
		suspendTenantMutation.isPending ||
		reactivateTenantMutation.isPending ||
		deleteTenantMutation.isPending;

	const invalidateTenantQueries = async () => {
		await invalidateStaffTenants(queryClient);
	};

	const performAction = async (action: 'suspend' | 'reactivate' | 'delete') => {
		try {
			if (action === 'suspend') {
				await suspendTenantMutation.mutateAsync({ tenantId: tenant.id });
			}
			if (action === 'reactivate') {
				await reactivateTenantMutation.mutateAsync({ tenantId: tenant.id });
			}
			if (action === 'delete') {
				await deleteTenantMutation.mutateAsync({ tenantId: tenant.id });
			}
		} catch (error) {
			setPendingAction(null);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
			}
			return;
		}

		setPendingAction(null);
		await invalidateTenantQueries();
	};

	if (!canSuspend && !canReactivate && !canDelete) {
		return (
			<span className="text-muted-foreground">
				<span aria-hidden="true">—</span>
				<span className="sr-only">{t('no-lifecycle-actions')}</span>
			</span>
		);
	}

	const dialogConfig = getConfirmDialogConfig(pendingAction, tenant.name, t);

	return (
		<div className="flex flex-col items-center gap-1">
			<DataTableRowActions
				ariaLabel={t('actions-for', { name: tenant.name })}
				testId={`staff-tenants-table-actions-${tenant.id}`}
			>
				{canReactivate ? (
					<DropdownMenuItem
						disabled={isActionPending}
						onClick={() => setPendingAction('reactivate')}
					>
						<IconRefresh />
						{t('reactivate')}
					</DropdownMenuItem>
				) : null}
				{canSuspend || canDelete ? (
					<>
						{canReactivate ? <DropdownMenuSeparator /> : null}
						{canSuspend ? (
							<DropdownMenuItem
								variant="destructive"
								disabled={isActionPending}
								onClick={() => setPendingAction('suspend')}
							>
								<IconPlayerPause />
								{t('suspend')}
							</DropdownMenuItem>
						) : null}
						{canDelete ? (
							<DropdownMenuItem
								variant="destructive"
								disabled={isActionPending}
								onClick={() => setPendingAction('delete')}
							>
								<IconTrash />
								{t('delete')}
							</DropdownMenuItem>
						) : null}
					</>
				) : null}
			</DataTableRowActions>

			<ConfirmDialog
				isOpen={pendingAction !== null}
				title={dialogConfig.title}
				description={dialogConfig.description}
				confirmLabel={dialogConfig.confirmLabel}
				isPending={isActionPending}
				onConfirm={() => {
					if (pendingAction) {
						void performAction(pendingAction);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingAction(null);
				}}
			/>
		</div>
	);
};
