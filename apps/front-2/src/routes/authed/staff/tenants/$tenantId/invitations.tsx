import {
	IconAlertCircle,
	IconChevronDown,
	IconCircleDot,
	IconClock,
	IconId,
	IconMail,
	IconPlus,
	IconUser,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
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
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
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
	TenantRetryActions,
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const EXPIRES_SOON_MS = 48 * 60 * 60 * 1000;

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
		? 'border-success/20 bg-success/10 text-success'
		: 'border-destructive/20 bg-destructive/10 text-destructive';

/** Honest "amber emphasis" for a near expiry — computed from the real
 * `expiresAt` value, never a fabricated "Expiring" status. */
export const isInvitationExpiringSoon = (
	expiresAt: Date | null,
	now: Date,
): boolean => {
	if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.valueOf())) {
		return false;
	}

	const diffMs = expiresAt.getTime() - now.getTime();
	return diffMs > 0 && diffMs < EXPIRES_SOON_MS;
};

export const createColumns = ({
	locale,
	t,
	isRevokePending,
	onRevoke,
}: CreateColumnsArgs): ColumnDef<StaffTenantInvitationRow>[] => [
	{
		id: 'email',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconMail className="size-3.5 text-muted-foreground" />
				<span>{t('invitee')}</span>
			</div>
		),
		accessorKey: 'email',
		meta: { width: '280px' },
		cell: ({ row }) => {
			const email = row.original.email || '—';
			return (
				<div className="flex min-w-0 items-center gap-2.5">
					<InitialsAvatar name={row.original.email} />
					<span className="min-w-0 truncate text-[13px]" title={email}>
						{email}
					</span>
				</div>
			);
		},
	},
	{
		id: 'profile_name',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconId className="size-3.5 text-muted-foreground" />
				<span>{t('profiles')}</span>
			</div>
		),
		accessorKey: 'profileName',
		enableSorting: false,
		meta: { width: '160px' },
		cell: ({ row }) => (
			<span className="publy-detail-chip publy-detail-chip--outline">
				{row.original.profileName}
			</span>
		),
	},
	{
		id: 'invited_by',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconUser className="size-3.5 text-muted-foreground" />
				<span>{t('invited-by')}</span>
			</div>
		),
		accessorKey: 'invitedByName',
		enableSorting: false,
		meta: { width: '150px' },
		cell: ({ getValue }) => (
			<span className="text-[13px] text-muted-foreground">
				{getValue<string>()}
			</span>
		),
	},
	{
		id: 'expires_at',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconClock className="size-3.5 text-muted-foreground" />
				<span>{t('expires')}</span>
			</div>
		),
		accessorFn: (row) => row.expiresAt,
		meta: { width: '150px' },
		cell: ({ row }) => {
			const expiresAt = row.original.expiresAt;
			const isExpiringSoon = isInvitationExpiringSoon(expiresAt, new Date());
			return (
				<span
					className={
						isExpiringSoon
							? 'text-[13px] font-medium text-[var(--publy-warning)]'
							: 'text-[13px] text-muted-foreground'
					}
				>
					{formatDateTime(expiresAt, locale)}
				</span>
			);
		},
	},
	{
		id: 'status',
		header: () => (
			<div className="inline-flex items-center gap-1.5">
				<IconCircleDot className="size-3.5 text-muted-foreground" />
				<span>{t('status')}</span>
			</div>
		),
		enableSorting: false,
		meta: { width: '128px' },
		cell: ({ row }) => {
			const status = normalizeInvitationStatus(row.original.status);
			return (
				<StatusPill tone={statusPillTone(status)}>
					{formatInvitationStatusLabel(status)}
				</StatusPill>
			);
		},
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) =>
			isStaffTenantInvitationRevocable(row.original) ? (
				<DataTableRowActions
					ariaLabel={`Actions for ${row.original.email || 'invitation'}`}
					testId={`staff-tenant-invitation-actions-${row.original.id}`}
				>
					<DropdownMenuItem
						variant="destructive"
						disabled={isRevokePending}
						onClick={() => onRevoke(row.original)}
					>
						{t('revoke')}
					</DropdownMenuItem>
				</DataTableRowActions>
			) : (
				<span
					aria-label="No actions available"
					className="flex justify-center text-muted-foreground"
				>
					—
				</span>
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
	const [pendingRevokeRowId, setPendingRevokeRowId] = useState<string | null>(
		null,
	);

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

	const handleRevoke = useCallback(
		async (row: StaffTenantInvitationRow) => {
			setFeedback(null);

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
			} finally {
				setPendingRevokeRowId(null);
			}
		},
		[queryClient, revokeInvitation, t, tenantId],
	);

	const promptRevoke = useCallback((row: StaffTenantInvitationRow) => {
		setPendingRevokeRowId(row.id);
	}, []);

	const columns = createColumns({
		locale: i18n.language,
		t,
		isRevokePending: revokeInvitation.isPending,
		onRevoke: (row) => {
			promptRevoke(row);
		},
	});

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

	const statusFilterLabel =
		selectedStatuses.length === 0
			? t('all-statuses')
			: selectedStatuses.map(formatInvitationStatusLabel).join(', ');

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="invitations"
			testId="staff-tenant-invitations-page"
			bodyScroll="contained"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<h2 className="publy-type-page-title">
						{t('pending-invitations')}
						{tenant.pendingInvitationsCount != null ? (
							<span className="ml-2 publy-profile-count-badge align-middle">
								{tenant.pendingInvitationsCount}
							</span>
						) : null}
					</h2>
					<p className="publy-type-helper">
						{t('tenant-invitations-tab-description')}
					</p>
				</div>
				<Link
					to="/staff/tenants/$tenantId/users"
					params={{ tenantId }}
					search={{ invite: 1 }}
					className={buttonVariants({ size: 'sm', variant: 'default' })}
				>
					<IconPlus aria-hidden="true" className="size-[15px]" />
					{t('invite-people')}
				</Link>
			</div>

			{feedback ? (
				<div
					className={`rounded-large border px-4 py-3 text-sm ${getFeedbackClassName(feedback.tone)}`}
					role="status"
				>
					{feedback.message}
				</div>
			) : null}

			<ConfirmDialog
				isOpen={pendingRevokeRowId !== null}
				title={t('revoke-invitation')}
				description="This will revoke the invitation. The invited user will no longer be able to accept it."
				confirmLabel={t('revoke')}
				isPending={revokeInvitation.isPending}
				onConfirm={() => {
					const row = rows.find((r) => r.id === pendingRevokeRowId);
					if (row) {
						void handleRevoke(row);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingRevokeRowId(null);
				}}
			/>

			<DataTable
				testId="staff-tenant-invitations-table"
				ariaLabel="Tenant invitations"
				columns={columns}
				rows={filteredRows}
				isPending={invitationsQuery.isPending}
				isError={invitationsQuery.isError}
				onRetry={() => void invitationsQuery.refetch()}
				emptyIcon={IconMail}
				emptyTitle={t('tenant-invitations-empty-title')}
				emptyContent={t('tenant-invitations-empty-description')}
				emptyActions={
					<Link
						to="/staff/tenants/$tenantId/users"
						params={{ tenantId }}
						search={{ invite: 1 }}
						className={buttonVariants({ size: 'sm', variant: 'outline' })}
					>
						<IconPlus aria-hidden="true" className="size-[15px]" />
						{t('invite-people')}
					</Link>
				}
				noMatchTitle={t('tenant-invitations-no-match-title')}
				noMatchContent={t('tenant-invitations-no-match-description')}
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
				searchPlaceholder={t('search-invitations')}
				toolbarEnd={
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									type="button"
									variant="outline"
									className="publy-data-table-filter-button max-w-64 text-[13px]"
								/>
							}
						>
							<IconCircleDot
								aria-hidden="true"
								className="size-[15px] text-[var(--publy-foreground-secondary)]"
							/>
							<span className="truncate">{statusFilterLabel}</span>
							<IconChevronDown aria-hidden="true" className="size-3" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={6}>
							{KNOWN_INVITATION_STATUSES.map((status) => (
								<DropdownMenuCheckboxItem
									key={status}
									checked={selectedStatuses.includes(status)}
									closeOnClick={false}
									showCheckbox
									onCheckedChange={() => toggleStatus(status)}
								>
									{formatInvitationStatusLabel(status)}
								</DropdownMenuCheckboxItem>
							))}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setStatuses([])}>
								{t('clear')}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				}
			/>
		</TenantDetailsPageShell>
	);
}
