import {
	IconBuilding,
	IconCircleDot,
	IconPlayerPause,
	IconPlus,
	IconRefresh,
	IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';
import { PageHeader, StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	STAFF_TENANT_DETAILS_QUERY_KEY,
	STAFF_TENANTS_QUERY_KEY,
	type StaffTenantRow,
	toStaffTenantRows,
	useDeleteStaffTenantMutation,
	useReactivateStaffTenantMutation,
	useStaffTenantsQuery,
	useSuspendStaffTenantMutation,
} from '~/lib/query/staff-tenants';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

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
				className="publy-record-link"
			>
				{row.original.name}
			</Link>
		),
	},
	{
		id: 'status',
		header: 'Status',
		accessorKey: 'status',
		meta: { headerIcon: <IconCircleDot />, cellClassName: 'w-32' },
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
		meta: { cellClassName: 'w-24' },
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'max_users',
		header: 'Max users',
		accessorKey: 'maxUsers',
		enableSorting: false,
		meta: { cellClassName: 'w-28' },
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'actions',
		header: '',
		enableSorting: false,
		meta: { cellClassName: 'w-10' },
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
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffTenantsPage,
});

function StaffTenantsPage() {
	const [shouldLogout, setShouldLogout] = useState(false);
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
	const query = useStaffTenantsQuery(controller.apiVariables);
	const rows = toStaffTenantRows(query.data?.data);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const columns = buildTenantColumns(() => {
		setShouldLogout(true);
	});

	return (
		<div className="space-y-4">
			<PageHeader
				title="Tenants"
				description="Manage tenant organizations, seats, and lifecycle."
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
					fallback:
						action === 'delete'
							? 'Unable to delete tenant.'
							: action === 'suspend'
								? 'Unable to suspend tenant.'
								: 'Unable to reactivate tenant.',
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
