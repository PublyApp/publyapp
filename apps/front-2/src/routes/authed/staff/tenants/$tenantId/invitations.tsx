import { Button } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import {
	isStaffTenantInvitationRevocable,
	STAFF_TENANT_INVITATIONS_QUERY_KEY,
	type StaffTenantInvitationRow,
	toStaffTenantInvitationRows,
	useRevokeStaffTenantInvitationMutation,
	useStaffTenantInvitationsQuery,
} from '~/lib/query/staff-tenant-invitations';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

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

type ActionFeedback = {
	message: string;
	tone: 'success' | 'error';
};

type CreateColumnsArgs = {
	locale: string;
	t: (key: string) => string;
	isRevokePending: boolean;
	onRevoke: (row: StaffTenantInvitationRow) => void;
};

const getFeedbackClassName = (tone: ActionFeedback['tone']): string =>
	tone === 'success'
		? 'border-success-200 bg-success-50 text-success-800'
		: 'border-danger-200 bg-danger-50 text-danger-800';

const createColumns = ({
	locale,
	t,
	isRevokePending,
	onRevoke,
}: CreateColumnsArgs): ColumnDef<StaffTenantInvitationRow>[] => [
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
	{
		id: 'actions',
		header: 'Actions',
		enableSorting: false,
		cell: ({ row }) =>
			isStaffTenantInvitationRevocable(row.original) ? (
				<Button
					type="button"
					size="sm"
					variant="danger-soft"
					isDisabled={isRevokePending}
					onPress={() => onRevoke(row.original)}
				>
					{t('staff-revoke')}
				</Button>
			) : (
				<span className="text-foreground-300">—</span>
			),
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
	const queryClient = useQueryClient();
	const { i18n, t } = useTranslation('common');
	const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);

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
	const revokeInvitation = useRevokeStaffTenantInvitationMutation();
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

	const handleRevoke = async (row: StaffTenantInvitationRow) => {
		setFeedback(null);

		if (
			typeof globalThis.confirm === 'function' &&
			!globalThis.confirm('Revoke invitation?')
		) {
			return;
		}

		try {
			await revokeInvitation.mutateAsync({
				tenantId,
				invitationId: row.id,
			});
			await queryClient.invalidateQueries({
				queryKey: ['staff', ...STAFF_TENANT_INVITATIONS_QUERY_KEY],
			});
			setFeedback({
				tone: 'success',
				message: t('revoke-invitation-success'),
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
				return;
			}

			setFeedback({
				tone: 'error',
				message: getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to revoke the invitation.',
				}),
			});
		}
	};

	const columns = useMemo(
		() =>
			createColumns({
				locale: i18n.language,
				t,
				isRevokePending: revokeInvitation.isPending,
				onRevoke: (row) => {
					void handleRevoke(row);
				},
			}),
		[i18n.language, revokeInvitation.isPending, t],
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

	if (
		invitationsQuery.isError &&
		shouldLogoutForFailure(invitationsQuery.error)
	) {
		return <LogoutRedirect />;
	}

	if (shouldRedirectToLogout) {
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
					Tenant invitations with search, status filters, sorting, cursor
					pagination, and pending-row revoke.
				</p>
			</div>

			{feedback ? (
				<div
					className={`rounded-large border px-4 py-3 text-sm ${getFeedbackClassName(feedback.tone)}`}
					role="status"
				>
					{feedback.message}
				</div>
			) : null}

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
