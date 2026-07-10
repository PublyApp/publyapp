import { IconAlertCircle } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { buttonVariants } from '~/components/ui/button';
import {
	type StaffTenantUserRow,
	toStaffTenantUserRows,
	useStaffTenantUsersQuery,
} from '~/lib/query/staff-tenant-users';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
} from '~/lib/url-state/table-search-params';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const makeTenantUserColumns = (
	tenantId: string,
): ColumnDef<StaffTenantUserRow>[] => [
	{
		id: 'name',
		header: 'Name',
		enableSorting: false,
		cell: ({ row }) => {
			const userId = row.original.id;

			return (
				<Link
					to="/staff/tenants/$tenantId/users/$userId"
					params={{
						tenantId,
						userId,
					}}
					className="font-medium text-primary underline-offset-4 hover:underline"
				>
					{row.original.displayName}
				</Link>
			);
		},
	},
	{
		id: 'email',
		header: 'Email',
		enableSorting: false,
		accessorKey: 'email',
		cell: ({ getValue }) => getValue<string>() || '—',
	},
	{
		id: 'level',
		header: 'Level',
		accessorKey: 'level',
		cell: ({ getValue }) => getValue<string | null>() ?? '—',
	},
	{
		id: 'status',
		header: 'Status',
		accessorKey: 'status',
		cell: ({ getValue }) => getValue<string | null>() ?? '—',
	},
];

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users',
)({
	validateSearch: (search) =>
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffTenantUsersPage,
});

function StaffTenantUsersPage() {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();

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
		cursorResetKey: tenantId,
	});
	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const usersQuery = useStaffTenantUsersQuery(
		{
			tenantId,
			q: controller.apiVariables.q,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
		},
		{
			enabled:
				tenantId.length > 0 && !detailsQuery.isPending && !detailsQuery.isError,
		},
	);

	if (detailsQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (detailsQuery.isError) {
		if (shouldLogoutForFailure(detailsQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	const tenant = toStaffTenantDetails(detailsQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="500 — Server Error"
				title="Unable to load this tenant"
				description="The tenant response was incomplete."
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void detailsQuery.refetch()} />
				}
			/>
		);
	}

	if (usersQuery.isError && shouldLogoutForFailure(usersQuery.error)) {
		return <LogoutRedirect />;
	}

	const rows = toStaffTenantUserRows(usersQuery.data?.data);
	const columns = makeTenantUserColumns(tenantId);

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="users"
			summary="Read-only tenant users carried forward in the front-2 migration shell."
			testId="staff-tenant-users-page"
		>
			<div className="space-y-2">
				<div className="flex items-center justify-between gap-4">
					<h2 className="text-lg font-semibold text-foreground">Users</h2>
					<Link
						to="/staff/tenants/$tenantId/users/invite"
						params={{ tenantId }}
						className={buttonVariants({ size: 'sm', variant: 'default' })}
					>
						Invite user
					</Link>
				</div>
				<p className="text-sm text-muted-foreground">
					Read-only tenant users with search, sorting, and cursor pagination.
				</p>
			</div>

			<DataTable<StaffTenantUserRow>
				testId="staff-tenant-users-table"
				ariaLabel="Tenant users"
				columns={columns}
				rows={rows}
				isPending={usersQuery.isPending}
				isError={usersQuery.isError}
				onRetry={() => void usersQuery.refetch()}
				emptyContent="No tenant users found."
				noMatchContent="No tenant users match your search."
				hasActiveSearch={Boolean(controller.search.committed)}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				pageIndex={controller.cursor.pageIndex}
				hasPreviousPage={controller.cursor.hasPreviousPage}
				hasNextPage={usersQuery.data?.nextCursor != null}
				isPaginationPending={usersQuery.isFetching}
				onNextPage={() =>
					controller.cursor.onNextPage(usersQuery.data?.nextCursor ?? undefined)
				}
				onPreviousPage={controller.cursor.onPreviousPage}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
			/>
		</TenantDetailsPageShell>
	);
}
