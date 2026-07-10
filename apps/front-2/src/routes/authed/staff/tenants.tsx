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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
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
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { PageHeader, StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	STAFF_TENANT_DETAILS_QUERY_KEY,
	STAFF_TENANTS_QUERY_KEY,
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
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import {
	parseTenantListSearchParams,
	serializeTenantListSearchParams,
	type TenantListSearchParamInput,
	type TenantListSearchParams,
} from './tenants-list-helpers';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const TENANT_STATUS_ACTIVE = 'Active';
const TENANT_STATUS_SUSPENDED = 'Suspended';

const buildTenantColumns = (
	onSessionExpired: () => void,
): ColumnDef<StaffTenantRow>[] => [
	{
		id: 'name',
		header: 'Name',
		accessorKey: 'name',
		meta: { headerIcon: <IconBuilding /> },
		cell: ({ row }) => (
			<Link
				to={'/staff/tenants/$tenantId' as never}
				params={{ tenantId: row.original.id } as never}
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
		header: 'Status',
		accessorKey: 'status',
		meta: { headerIcon: <IconCircleDot />, width: '124px' },
		cell: ({ row }) => {
			const status = row.original.status;
			if (!status) {
				return '—';
			}

			return <StatusPill tone={statusPillTone(status)}>{status}</StatusPill>;
		},
	},
	{
		id: 'users_count',
		header: 'Users',
		accessorKey: 'usersCount',
		enableSorting: false,
		meta: { width: '92px' },
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'max_users',
		header: 'Max users',
		accessorKey: 'maxUsers',
		enableSorting: false,
		meta: { width: '132px' },
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'actions',
		// Visually chromeless per the handoff, but the columnheader needs an
		// accessible name (axe empty-table-header, parity contract).
		header: () => <span className="sr-only">Actions</span>,
		enableSorting: false,
		meta: { width: '40px' },
		cell: ({ row }) => (
			<TenantLifecycleActionsCell
				tenant={row.original}
				onSessionExpired={onSessionExpired}
			/>
		),
	},
];

export const Route = createFileRoute('/_authed-layout/staff/tenants')({
	validateSearch: (search) =>
		parseTenantListSearchParams(search as TenantListSearchParamInput),
	component: StaffTenantsPage,
});

function StaffTenantsPage() {
	const [shouldLogout, setShouldLogout] = useState(false);
	const [bulkFeedback, setBulkFeedback] = useState<TenantBulkFeedback | null>(
		null,
	);
	const navigate = Route.useNavigate();
	const search = Route.useSearch() as TenantListSearchParams;
	const { t } = useTranslation('common');

	const onSearchChange = (next: TenantListSearchParams): void => {
		void navigate({
			search: serializeTenantListSearchParams({
				...next,
				status: search.status,
			}) as unknown as TenantListSearchParams,
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

	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const onSessionExpired = () => setShouldLogout(true);
	const columns = buildTenantColumns(onSessionExpired);

	return (
		<div className="publy-page-fill">
			<PageHeader
				title="Tenants"
				description="Manage tenant organizations, seats, and lifecycle."
				count={
					rows.length > 0 ? (
						<span className="publy-profile-count-badge">{rows.length}</span>
					) : null
				}
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
				ariaLabel="Staff tenants"
				columns={columns}
				rows={rows}
				isPending={query.isPending}
				isError={query.isError}
				onRetry={() => void query.refetch()}
				errorContent="Unable to load tenants right now."
				emptyContent="No tenants found."
				noMatchContent="No tenants match your search."
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
				toolbarEnd={
					selection.isSelectionMode ? (
						<TenantBulkActionsToolbar
							rows={rows}
							selection={selection}
							onSessionExpired={onSessionExpired}
							onFeedback={setBulkFeedback}
						/>
					) : null
				}
			/>
		</div>
	);
}

type PendingLifecycleAction = 'suspend' | 'reactivate' | 'delete' | null;

const getConfirmDialogConfig = (action: PendingLifecycleAction) => {
	switch (action) {
		case 'suspend':
			return {
				title: 'Suspend tenant',
				description:
					'Suspending this tenant will temporarily disable access for all associated users and projects. You can reactivate it later.',
				confirmLabel: 'Suspend',
			};
		case 'reactivate':
			return {
				title: 'Reactivate tenant',
				description:
					'Reactivating this tenant will restore access for all previously suspended users and projects.',
				confirmLabel: 'Reactivate',
			};
		case 'delete':
			return {
				title: 'Delete tenant',
				description:
					'This tenant is currently suspended. Deleting it is permanent and cannot be undone. All associated data will be removed.',
				confirmLabel: 'Delete',
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

const TENANT_LIFECYCLE_ACTION_FALLBACKS: Record<TenantBulkActionKey, string> = {
	suspend: 'Unable to suspend tenant.',
	reactivate: 'Unable to reactivate tenant.',
	delete: 'Unable to delete tenant.',
};

const TenantBulkActionsToolbar = ({
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
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANTS_QUERY_KEY],
			}),
			queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANT_DETAILS_QUERY_KEY],
			}),
		]);

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
		<div className="flex items-center gap-2.5">
			<span className="text-xs text-muted-foreground">
				{t('selected-count', { count: selectedCount })}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => selection.clearSelection()}
			>
				{t('clear-selection')}
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							variant="outline"
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
							className="publy-data-table-filter-button text-[13px]"
						/>
					}
				>
					{t('bulk-actions')}
					<IconChevronDown aria-hidden="true" className="size-3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={6}>
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
		</div>
	);
};

const TenantLifecycleActionsCell = ({
	tenant,
	onSessionExpired,
}: {
	tenant: StaffTenantRow;
	onSessionExpired: () => void;
}) => {
	const queryClient = useQueryClient();
	const [errorMessage, setErrorMessage] = useState('');
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
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANTS_QUERY_KEY],
			}),
			queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANT_DETAILS_QUERY_KEY],
			}),
		]);
	};

	const performAction = async (action: 'suspend' | 'reactivate' | 'delete') => {
		setErrorMessage('');

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

			setErrorMessage(
				getFailureMessage(toApiFailure(error), {
					fallback: TENANT_LIFECYCLE_ACTION_FALLBACKS[action],
				}),
			);
		} finally {
			setPendingAction(null);
		}
	};

	if (!canSuspend && !canReactivate && !canDelete) {
		return (
			<span aria-label="No lifecycle actions" className="text-muted-foreground">
				—
			</span>
		);
	}

	const dialogConfig = getConfirmDialogConfig(pendingAction);

	return (
		<div className="flex flex-col items-end gap-1">
			<DataTableRowActions
				ariaLabel={`Actions for ${tenant.name}`}
				testId={`tenant-actions-${tenant.id}`}
			>
				{canReactivate ? (
					<DropdownMenuItem
						disabled={isActionPending}
						onClick={() => setPendingAction('reactivate')}
					>
						<IconRefresh />
						Reactivate
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
								Suspend
							</DropdownMenuItem>
						) : null}
						{canDelete ? (
							<DropdownMenuItem
								variant="destructive"
								disabled={isActionPending}
								onClick={() => setPendingAction('delete')}
							>
								<IconTrash />
								Delete
							</DropdownMenuItem>
						) : null}
					</>
				) : null}
			</DataTableRowActions>
			{errorMessage ? (
				<p className="max-w-56 text-right text-xs text-destructive">
					{errorMessage}
				</p>
			) : null}

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
