import { Chip } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import {
	type StaffTenantProfileRow,
	toStaffTenantProfileRows,
	useStaffTenantProfilesQuery,
} from '~/lib/query/staff-tenant-profiles';
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
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles',
)({
	validateSearch: (search) =>
		parseTableSearchParams(search as TableSearchParamInput),
	component: StaffTenantProfilesPage,
});

function StaffTenantProfilesPage() {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const columns: ColumnDef<StaffTenantProfileRow>[] = [
		{
			id: 'name',
			header: 'Name',
			accessorKey: 'name',
			cell: ({ row }) => (
				<div className="space-y-1">
					<Link
						to={'/staff/tenants/$tenantId/profiles/$profileId' as never}
						params={{ tenantId, profileId: row.original.id } as never}
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						{row.original.name || '—'}
					</Link>
					<p className="text-xs text-foreground-500">
						{row.original.description ?? 'No description provided.'}
					</p>
				</div>
			),
		},
		{
			id: 'description',
			header: 'Description',
			accessorKey: 'description',
			enableSorting: false,
			cell: ({ getValue }) => getValue<string | null>() ?? '—',
		},
		{
			id: 'is_default',
			header: 'Default',
			accessorKey: 'isDefault',
			enableSorting: false,
			cell: ({ getValue }) =>
				getValue<boolean>() ? (
					<Chip color="accent" size="sm" variant="soft">
						Default
					</Chip>
				) : (
					'—'
				),
		},
		{
			id: 'user_account_count',
			header: 'Assigned users',
			accessorKey: 'userAccountCount',
			enableSorting: false,
			cell: ({ getValue }) => String(getValue<number>()),
		},
	];

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
	const profilesQuery = useStaffTenantProfilesQuery(
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

		return <TenantDetailsError error={detailsQuery.error} />;
	}

	const tenant = toStaffTenantDetails(detailsQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon="!"
				code="500 — Server Error"
				title="Unable to load this tenant"
				description="The tenant response was incomplete."
				testId="staff-tenant-details-error"
			/>
		);
	}

	if (profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error)) {
		return <LogoutRedirect />;
	}

	const rows = toStaffTenantProfileRows(profilesQuery.data?.data);

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="profiles"
			summary="Read-only tenant profiles carried forward in the front-2 migration shell."
			testId="staff-tenant-profiles-page"
		>
			<div className="space-y-2">
				<h2 className="text-lg font-semibold text-foreground">Profiles</h2>
				<p className="text-sm text-foreground-500">
					Read-only tenant profiles with search, sorting, and cursor pagination.
				</p>
			</div>

			<DataTable
				testId="staff-tenant-profiles-table"
				ariaLabel="Tenant profiles"
				columns={columns}
				rows={rows}
				isPending={profilesQuery.isPending}
				isError={profilesQuery.isError}
				onRetry={() => void profilesQuery.refetch()}
				emptyContent="No tenant profiles found."
				noMatchContent="No tenant profiles match your search."
				hasActiveSearch={Boolean(controller.search.committed)}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				pageIndex={controller.cursor.pageIndex}
				hasPreviousPage={controller.cursor.hasPreviousPage}
				hasNextPage={profilesQuery.data?.nextCursor != null}
				isPaginationPending={profilesQuery.isFetching}
				onNextPage={() =>
					controller.cursor.onNextPage(
						profilesQuery.data?.nextCursor ?? undefined,
					)
				}
				onPreviousPage={controller.cursor.onPreviousPage}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
			/>
		</TenantDetailsPageShell>
	);
}
