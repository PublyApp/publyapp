import { Button } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
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

const getStatusClassName = (status: string | null): string => {
	switch (status) {
		case TENANT_STATUS_ACTIVE:
			return 'border-success-200 bg-success-50 text-success-800';
		case 'Pending':
			return 'border-warning-200 bg-warning-50 text-warning-800';
		case TENANT_STATUS_SUSPENDED:
			return 'border-danger-200 bg-danger-50 text-danger-800';
		default:
			return 'border-default-200 bg-default-100 text-foreground';
	}
};

const confirmAction = (message: string): boolean =>
	typeof globalThis.confirm === 'function' && globalThis.confirm(message);

const buildTenantColumns = (
	onSessionExpired: () => void,
): ColumnDef<StaffTenantRow>[] => [
	{
		id: 'name',
		header: 'Name',
		accessorKey: 'name',
		cell: ({ row }) => (
			<div className="space-y-1">
				<a
					href={`/staff/tenants/${row.original.id}`}
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					{row.original.name}
				</a>
			</div>
		),
	},
	{
		id: 'status',
		header: 'Status',
		accessorKey: 'status',
		cell: ({ row }) => {
			const status = row.original.status;
			if (!status) {
				return '—';
			}

			return (
				<span
					className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusClassName(status)}`}
				>
					{status}
				</span>
			);
		},
	},
	{
		id: 'users_count',
		header: 'Users',
		accessorKey: 'usersCount',
		enableSorting: false,
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'max_users',
		header: 'Max users',
		accessorKey: 'maxUsers',
		enableSorting: false,
		cell: ({ getValue }) => String(getValue<number>()),
	},
	{
		id: 'actions',
		header: 'Actions',
		enableSorting: false,
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
		<div className="space-y-4 p-4">
			<h1 className="text-xl font-semibold">Tenants</h1>
			<div className="text-right">
				<a
					href="/staff/tenants/new"
					className="text-sm font-medium text-primary underline-offset-4 hover:underline"
				>
					{t('new-item', { item: t('tenant') })}
				</a>
			</div>
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

const TenantLifecycleActionsCell = ({
	tenant,
	onSessionExpired,
}: {
	tenant: StaffTenantRow;
	onSessionExpired: () => void;
}) => {
	const queryClient = useQueryClient();
	const [errorMessage, setErrorMessage] = useState('');
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

		const actionConfirmed =
			action === 'suspend'
				? confirmAction('Suspend this tenant?')
				: action === 'reactivate'
					? confirmAction('Reactivate this tenant?')
					: confirmAction(
							'Delete this tenant? This tenant is suspended and the action cannot be undone.',
						);

		if (!actionConfirmed) {
			return;
		}

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
		}
	};

	if (!canSuspend && !canReactivate && !canDelete) {
		return <span className="text-xs text-muted">No lifecycle actions.</span>;
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				{canSuspend ? (
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onPress={() => void performAction('suspend')}
						isDisabled={isActionPending}
					>
						Suspend
						{suspendTenantMutation.isPending ? '…' : ''}
					</Button>
				) : null}
				{canReactivate ? (
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onPress={() => void performAction('reactivate')}
						isDisabled={isActionPending}
					>
						Reactivate
						{reactivateTenantMutation.isPending ? '…' : ''}
					</Button>
				) : null}
				{canDelete ? (
					<Button
						type="button"
						variant="danger"
						size="sm"
						onPress={() => void performAction('delete')}
						isDisabled={isActionPending}
					>
						Delete
						{deleteTenantMutation.isPending ? '…' : ''}
					</Button>
				) : null}
			</div>
			{errorMessage ? (
				<p className="max-w-56 text-xs text-danger-600">{errorMessage}</p>
			) : null}
		</div>
	);
};
