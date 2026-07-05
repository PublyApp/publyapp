import { Button } from '@heroui/react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import {
	type StaffTenantInvitationRow,
	toStaffTenantInvitationRows,
	useStaffTenantInvitationsQuery,
} from '~/lib/query/staff-tenant-invitations';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	filterInvitationRows,
	formatInvitationStatusLabel,
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type KnownInvitationStatus,
	KNOWN_INVITATION_STATUSES,
	normalizeInvitationStatus,
	parseInvitationListSearchParams,
	parseInvitationStatusFilter,
	serializeInvitationListSearchParams,
	serializeInvitationStatusFilter,
} from '../../invitations/list-helpers';
import {
	formatDateTime,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const createColumns = (
	locale: string,
): ColumnDef<StaffTenantInvitationRow>[] => [
	{
		id: 'email',
		header: 'Email',
		accessorKey: 'email',
	},
	{
		id: 'status',
		header: 'Status',
		enableSorting: false,
		cell: ({ row }) => (
			<span className="inline-flex rounded-full bg-default-100 px-2 py-1 text-xs font-medium text-foreground">
				{formatInvitationStatusLabel(
					normalizeInvitationStatus(row.original.status),
				)}
			</span>
		),
	},
	{
		id: 'profile_name',
		header: 'Profile',
		accessorKey: 'profileName',
		enableSorting: false,
	},
	{
		id: 'invited_by',
		header: 'Invited by',
		accessorKey: 'invitedByName',
		enableSorting: false,
	},
	{
		id: 'created_at',
		header: 'Created',
		accessorFn: (row) => row.createdAt,
		cell: ({ row }) => formatDateTime(row.original.createdAt, locale),
	},
	{
		id: 'expires_at',
		header: 'Expires',
		accessorFn: (row) => row.expiresAt,
		cell: ({ row }) => formatDateTime(row.original.expiresAt, locale),
	},
	{
		id: 'accepted_at',
		header: 'Accepted',
		accessorFn: (row) => row.acceptedAt,
		cell: ({ row }) => formatDateTime(row.original.acceptedAt, locale),
	},
];

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/invitations',
)({
	validateSearch: (search) =>
		parseInvitationListSearchParams(search as InvitationListSearchParamInput),
	component: StaffTenantInvitationsPage,
});

function StaffTenantInvitationsPage() {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch() as InvitationListSearchParams;
	const { i18n } = useTranslation('common');

	const selectedStatuses = parseInvitationStatusFilter(search.status);

	const onSearchChange = (next: InvitationListSearchParams): void => {
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				...next,
				status: search.status,
			}) as unknown as InvitationListSearchParams,
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: `${tenantId}:${search.status ?? ''}`,
	});
	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const invitationsQuery = useStaffTenantInvitationsQuery(
		{
			tenantId,
			q: controller.apiVariables.q,
			status: search.status,
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
	const columns = useMemo(() => createColumns(i18n.language), [i18n.language]);

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

	if (
		invitationsQuery.isError &&
		shouldLogoutForFailure(invitationsQuery.error)
	) {
		return <LogoutRedirect />;
	}

	const rows = toStaffTenantInvitationRows(invitationsQuery.data?.data);
	const filteredRows = filterInvitationRows(rows, controller.search.committed);

	const setStatuses = (nextStatuses: KnownInvitationStatus[]): void => {
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				status: serializeInvitationStatusFilter(nextStatuses),
				cursor: undefined,
			}) as unknown as InvitationListSearchParams,
			replace: true,
		});
	};

	const toggleStatus = (status: KnownInvitationStatus): void => {
		if (selectedStatuses.includes(status)) {
			setStatuses(selectedStatuses.filter((value) => value !== status));
			return;
		}

		setStatuses([...selectedStatuses, status]);
	};

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="invitations"
			summary="Read-only tenant invitations carried forward in the front-2 migration shell."
			testId="staff-tenant-invitations-page"
		>
			<div className="space-y-2">
				<h2 className="text-lg font-semibold text-foreground">Invitations</h2>
				<p className="text-sm text-foreground-500">
					Read-only tenant invitations with search, status filters, sorting, and
					cursor pagination.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{KNOWN_INVITATION_STATUSES.map((status) => {
					const isSelected = selectedStatuses.includes(status);

					return (
						<Button
							key={status}
							size="sm"
							type="button"
							variant={isSelected ? 'primary' : 'secondary'}
							onPress={() => toggleStatus(status)}
						>
							{formatInvitationStatusLabel(status)}
						</Button>
					);
				})}
				<Button
					size="sm"
					type="button"
					variant="ghost"
					onPress={() => setStatuses([])}
				>
					Clear
				</Button>
			</div>

			<DataTable
				testId="staff-tenant-invitations-table"
				ariaLabel="Tenant invitations"
				columns={columns}
				rows={filteredRows}
				isPending={invitationsQuery.isPending}
				isError={invitationsQuery.isError}
				onRetry={() => void invitationsQuery.refetch()}
				emptyContent="No tenant invitations found."
				noMatchContent="No tenant invitations match your search."
				hasActiveSearch={Boolean(controller.search.committed || search.status)}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				pageIndex={controller.cursor.pageIndex}
				hasPreviousPage={controller.cursor.hasPreviousPage}
				hasNextPage={invitationsQuery.data?.nextCursor != null}
				isPaginationPending={invitationsQuery.isFetching}
				onNextPage={() =>
					controller.cursor.onNextPage(
						invitationsQuery.data?.nextCursor ?? undefined,
					)
				}
				onPreviousPage={controller.cursor.onPreviousPage}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
			/>
		</TenantDetailsPageShell>
	);
}
