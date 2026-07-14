import {
	IconBuilding,
	IconChevronDown,
	IconCircleDot,
	IconPlayerPause,
	IconPlus,
	IconRefresh,
	IconTrash,
	IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import {
	DataTable,
	SELECTION_LOCKED_TITLE_KEY,
} from '~/components/table/data-table';
import {
	FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME,
	FloatingSelectionBar,
} from '~/components/table/floating-selection-bar';
import { DataTableRowActions } from '~/components/table/row-actions';
import {
	useRowSelection,
	type UseRowSelectionResult,
} from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { Button, buttonVariants } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { PageHeader, StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
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
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import {
	parseTenantListSearchParams,
	serializeTenantListSearchParams,
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
	value: TenantStatusFilter | undefined,
	t: (key: string) => string,
): string => {
	if (value === 'pending') {
		return t('status-pending');
	}
	if (value === 'active') {
		return t('status-active');
	}
	if (value === 'suspended') {
		return t('status-suspended');
	}
	return t('all-statuses');
};

const TenantStatusFilterMenu = ({
	value,
	onChange,
	disabled,
}: {
	value: TenantStatusFilter | undefined;
	onChange: (next: TenantStatusFilter | undefined) => void;
	disabled?: boolean;
}) => {
	const { t } = useTranslation('common');
	const label = formatTenantStatusFilterLabel(value, t);

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
					checked={value === undefined}
					closeOnClick
					data-testid="staff-tenants-table-status-filter-all"
					onCheckedChange={() => onChange(undefined)}
				>
					{t('all-statuses')}
				</DropdownMenuCheckboxItem>
				{TENANT_STATUS_FILTERS.map((status) => (
					<DropdownMenuCheckboxItem
						key={status}
						checked={value === status}
						closeOnClick
						data-testid={`staff-tenants-table-status-filter-${status}`}
						onCheckedChange={() => onChange(status)}
					>
						{formatTenantStatusFilterLabel(status, t)}
					</DropdownMenuCheckboxItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => onChange(undefined)}>
					{t('clear')}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

const buildTenantColumns = (
	onSessionExpired: () => void,
	onFeedback: (feedback: TenantBulkFeedback) => void,
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
				<InitialsAvatar name={row.original.name} />
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
				onFeedback={onFeedback}
			/>
		),
	},
];

export const Route = createFileRoute('/_authed-layout/staff/tenants')({
	validateSearch: (search) =>
		validateTenantListSearchParams(search as TenantListSearchParamInput),
	component: StaffTenantsPage,
});

function StaffTenantsPage() {
	const [shouldLogout, setShouldLogout] = useState(false);
	const [bulkFeedback, setBulkFeedback] = useState<TenantBulkFeedback | null>(
		null,
	);
	const navigate = Route.useNavigate();
	const search = parseTenantListSearchParams(
		Route.useSearch() as TenantListSearchParamInput,
	);
	const { t } = useTranslation('common');

	const onSearchChange = (next: TenantListSearchParams): void => {
		void navigate({
			search: serializeTenantListSearchParams(next),
			replace: true,
		});
	};

	const setStatusFilter = (next: TenantStatusFilter | undefined): void => {
		void navigate({
			search: serializeTenantListSearchParams({
				...search,
				status: next,
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: search.status ?? '',
	});
	const query = useStaffTenantsQuery({
		...controller.apiVariables,
		status: search.status,
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
	const onRowActionFeedback = useCallback(
		(feedback: TenantBulkFeedback) => setBulkFeedback(feedback),
		[],
	);
	const columns = useMemo(
		() => buildTenantColumns(onSessionExpired, onRowActionFeedback, t),
		[onSessionExpired, onRowActionFeedback, t],
	);

	if (query.isError && shouldLogoutForFailure(query.error)) {
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
			{bulkFeedback ? (
				<div
					className="flex items-center gap-1.5 text-xs"
					data-tone={bulkFeedback.tone}
					role="status"
				>
					<span className={bulkFeedbackToneClassName(bulkFeedback.tone)}>
						{bulkFeedback.message}
					</span>
					<button
						type="button"
						aria-label={t('close')}
						onClick={() => setBulkFeedback(null)}
						className="text-muted-foreground"
					>
						<IconX className="size-3.5" />
					</button>
				</div>
			) : null}
			<DataTable
				testId="staff-tenants-table"
				ariaLabel={t('staff-tenants-table-aria-label')}
				columns={columns}
				rows={rows}
				getRowLabel={(row) => row.name}
				isPending={query.isPending}
				isError={query.isError}
				onRetry={() => void query.refetch()}
				hasActiveSearch={Boolean(controller.search.committed || search.status)}
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
					onFeedback={setBulkFeedback}
				/>
			</FloatingSelectionBar>
		</div>
	);
}

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

type TenantBulkFeedback = {
	tone: 'warning' | 'success' | 'error';
	message: string;
};

const bulkFeedbackToneClassName = (
	tone: TenantBulkFeedback['tone'],
): string => {
	if (tone === 'error') {
		return 'text-destructive';
	}
	if (tone === 'success') {
		return 'text-[var(--publy-success)]';
	}
	return 'text-muted-foreground';
};

type TenantBulkActionKey = 'suspend' | 'reactivate' | 'delete';

const TENANT_BULK_FAILURE_KEYS: Record<TenantBulkActionKey, string> = {
	suspend: 'tenant-bulk-suspend-failure',
	reactivate: 'tenant-bulk-reactivate-failure',
	delete: 'tenant-bulk-delete-failure',
};

const TENANT_BULK_SUCCESS_KEYS: Record<TenantBulkActionKey, string> = {
	suspend: 'tenant-bulk-suspend-success',
	reactivate: 'tenant-bulk-reactivate-success',
	delete: 'tenant-bulk-delete-success',
};

const TENANT_BULK_PARTIAL_SUCCESS_KEYS: Record<TenantBulkActionKey, string> = {
	suspend: 'tenant-bulk-suspend-partial-success',
	reactivate: 'tenant-bulk-reactivate-partial-success',
	delete: 'tenant-bulk-delete-partial-success',
};

const TENANT_LIFECYCLE_ACTION_FALLBACK_KEYS: Record<
	TenantBulkActionKey,
	string
> = {
	suspend: 'unable-to-suspend-tenant',
	reactivate: 'unable-to-reactivate-tenant',
	delete: 'unable-to-delete-tenant',
};

const TenantBulkActions = ({
	rows,
	selection,
	onSessionExpired,
	onFeedback,
}: {
	rows: StaffTenantRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
	onFeedback: (feedback: TenantBulkFeedback | null) => void;
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
			return selectedTenants
				.filter((tenant) => tenant.status === TENANT_STATUS_ACTIVE)
				.map((tenant) => tenant.id);
		}
		if (action === 'reactivate') {
			return selectedTenants
				.filter((tenant) => tenant.status === TENANT_STATUS_SUSPENDED)
				.map((tenant) => tenant.id);
		}
		if (action === 'delete') {
			const allSelectedAreSuspended =
				selectedTenants.length > 0 &&
				selectedTenants.every(
					(tenant) => tenant.status === TENANT_STATUS_SUSPENDED,
				);
			return allSelectedAreSuspended
				? selectedTenants.map((tenant) => tenant.id)
				: [];
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
	// the click handler enforces eligibility and surfaces the reason inline
	// rather than disabling or hiding the item.
	const handleMenuItemClick = (action: PendingLifecycleAction) => {
		onFeedback(null);
		if (eligibleIdsFor(action).length === 0) {
			onFeedback({ tone: 'warning', message: ineligibleMessageFor(action) });
			return;
		}
		setPendingAction(action);
	};

	const performBulkAction = async (action: TenantBulkActionKey) => {
		const eligibleIds = eligibleIdsFor(action);
		onFeedback(null);

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

			onFeedback({
				tone: 'error',
				message: getFailureMessage(toApiFailure(error), {
					fallback: t(TENANT_BULK_FAILURE_KEYS[action]),
				}),
			});
			return;
		}

		setPendingAction(null);
		selection.clearSelection();
		await invalidateStaffTenants(queryClient);

		const succeededCount = result?.succeededCount ?? 0;
		const failedCount = result?.failedCount ?? 0;

		onFeedback({
			tone: failedCount > 0 ? 'error' : 'success',
			message:
				failedCount > 0
					? t(TENANT_BULK_PARTIAL_SUCCESS_KEYS[action], {
							succeeded: succeededCount,
							failed: failedCount,
						})
					: t(TENANT_BULK_SUCCESS_KEYS[action], { count: succeededCount }),
		});
	};

	const dialogConfig = getBulkConfirmDialogConfig(
		pendingAction,
		eligibleIdsFor(pendingAction).length,
		t,
	);

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
											count: selectedCount,
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
						disabled={isActionPending}
						onClick={() => handleMenuItemClick('reactivate')}
					>
						<IconRefresh />
						{t('bulk-reactivate')}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						disabled={isActionPending}
						onClick={() => handleMenuItemClick('suspend')}
					>
						<IconPlayerPause />
						{t('bulk-suspend')}
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						disabled={isActionPending}
						onClick={() => handleMenuItemClick('delete')}
					>
						<IconTrash />
						{t('bulk-delete')}
					</DropdownMenuItem>
				</DropdownMenuContent>
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

const TenantLifecycleActionsCell = ({
	tenant,
	onSessionExpired,
	onFeedback,
}: {
	tenant: StaffTenantRow;
	onSessionExpired: () => void;
	onFeedback: (feedback: TenantBulkFeedback) => void;
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

			await invalidateTenantQueries();
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			onFeedback({
				tone: 'error',
				message: getFailureMessage(toApiFailure(error), {
					fallback: t(TENANT_LIFECYCLE_ACTION_FALLBACK_KEYS[action]),
				}),
			});
		} finally {
			setPendingAction(null);
		}
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
