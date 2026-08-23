import {
	IconAlertCircle,
	IconChevronDown,
	IconCircleDot,
	IconClock,
	IconId,
	IconKey,
	IconMail,
	IconPlus,
	IconUser,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { useTableController } from '~/components/table/use-table-controller';
import { paletteIndex } from '~/components/ui/avatar-initials';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
	isStaffTenantInvitationRevocable,
	type StaffTenantInvitationRow,
	toStaffTenantInvitationRows,
	useRevokeStaffTenantInvitationMutation,
	useStaffTenantInvitationsQuery,
} from '~/lib/query/staff-tenant-invitations';
import {
	invalidateAllStaffTenantScopes,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	type InvitationDisplayStatus,
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type KnownInvitationAccountLevel,
	type KnownInvitationStatus,
	KNOWN_INVITATION_ACCOUNT_LEVELS,
	KNOWN_INVITATION_STATUSES,
	normalizeInvitationStatus,
	parseInvitationAccountLevelFilter,
	parseInvitationListSearchParams,
	parseInvitationStatusFilter,
	serializeInvitationAccountLevelFilter,
	serializeInvitationListSearchParams,
	serializeInvitationStatusFilter,
} from '../../invitations/list-helpers';
import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';
import {
	type InviteUserSearchState,
	type InviteUserSearchStateInput,
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
} from './_invite-user-search-state';
import {
	formatDateTime,
	formatTenantUserLevelLabel,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;
const EXPIRES_SOON_MS = 48 * 60 * 60 * 1000;
const VISIBLE_PROFILE_CHIP_COUNT = 2;

type InvitationRouteSearchParams = InvitationListSearchParams &
	InviteUserSearchState & {
		level?: string;
	};

type InvitationRouteSearchParamInput = InvitationListSearchParamInput &
	InviteUserSearchStateInput & {
		level?: unknown;
	};

const parseInvitationRouteSearchParams = (
	search: InvitationRouteSearchParamInput,
): InvitationRouteSearchParams => {
	const level = serializeInvitationAccountLevelFilter(
		parseInvitationAccountLevelFilter(search.level),
	);

	return {
		...parseInvitationListSearchParams(search),
		level: level || undefined,
		...parseInviteUserSearchParams(search),
	};
};

const serializeInvitationRouteSearchParams = (
	search: InvitationRouteSearchParams,
): Record<string, string | 1 | undefined> => {
	const level = serializeInvitationAccountLevelFilter(
		parseInvitationAccountLevelFilter(search.level),
	);

	return {
		...serializeInvitationListSearchParams(search),
		level: level || undefined,
		...serializeInviteUserSearchParams(search),
	};
};

type CreateColumnsArgs = {
	locale: string;
	t: (key: string, options?: Record<string, unknown>) => string;
	isRevokePending: boolean;
	onRevoke: (row: StaffTenantInvitationRow) => void;
};

/** `list-helpers.ts`'s own `formatInvitationStatusLabel` capitalizes the raw
 * token instead of translating it; its `getInvitationStatusLabelKey` points
 * at `invitation-status-*` keys that don't exist in the locale bundle. Both
 * are shared with the staff invitations list (owned by a different slice),
 * so this route resolves the label locally against the real `pending` /
 * `accepted` / `expired` / `revoked` / `status-unknown` keys instead. */
const formatTenantInvitationStatusLabel = (
	status: InvitationDisplayStatus,
	t: (key: string) => string,
): string => (status === 'unknown' ? t('status-unknown') : t(status));

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
		cell: ({ row }) => {
			const email = row.original.email;
			return (
				<div className="flex min-w-0 items-center gap-2.5">
					<span
						aria-hidden="true"
						className="publy-avatar-initials inline-flex size-[26px] shrink-0 items-center justify-center rounded-[var(--publy-radius-small-control)]"
						data-palette={paletteIndex(email)}
					>
						<IconMail className="size-3.5" />
					</span>
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
				<span>{t('access')}</span>
			</div>
		),
		accessorKey: 'profileName',
		enableSorting: false,
		meta: { width: '160px', hideBelow: 768 },
		cell: ({ row }) => {
			const profiles = row.original.profiles ?? [];
			if (profiles.length > 0) {
				const visibleProfiles = profiles.slice(0, VISIBLE_PROFILE_CHIP_COUNT);
				const overflowProfiles = profiles.slice(VISIBLE_PROFILE_CHIP_COUNT);

				return (
					<div className="flex min-w-0 items-center gap-1">
						{visibleProfiles.map((profile) => (
							<span
								key={profile.id}
								className="publy-detail-chip publy-detail-chip--outline max-w-24 truncate"
								title={profile.name}
							>
								{profile.name}
							</span>
						))}
						{overflowProfiles.length > 0 ? (
							<span
								className="publy-detail-chip publy-detail-chip--outline"
								title={overflowProfiles
									.map((profile) => profile.name)
									.join(', ')}
							>
								+{overflowProfiles.length}
							</span>
						) : null}
					</div>
				);
			}

			const profileName = row.original.profileName;
			const access = profileName?.trim().length
				? profileName
				: formatTenantUserLevelLabel(row.original.accountLevel, t);

			return (
				<span className="publy-detail-chip publy-detail-chip--outline">
					{access}
				</span>
			);
		},
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
		meta: { width: '150px', hideBelow: 768 },
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
		meta: { width: '150px', hideBelow: 768 },
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
					{formatTenantInvitationStatusLabel(status, t)}
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
					ariaLabel={t('actions-for', {
						name: row.original.email || t('invitation'),
					})}
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
				<span className="flex justify-center text-muted-foreground">
					<span aria-hidden="true">—</span>
					<span className="sr-only">{t('no-actions-available')}</span>
				</span>
			),
	},
];

const StaffTenantInvitationsPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseInvitationRouteSearchParams(
		Route.useSearch() as InvitationRouteSearchParamInput,
	) satisfies InvitationRouteSearchParams;
	const queryClient = useQueryClient();
	const { i18n, t } = useTranslation('common');
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const [pendingRevokeRowId, setPendingRevokeRowId] = useState<string | null>(
		null,
	);
	const isInviteDrawerOpen = search.invite === 1;

	const selectedStatuses = parseInvitationStatusFilter(search.status);
	const selectedLevels = parseInvitationAccountLevelFilter(search.level);

	const onSearchChange = (next: InvitationRouteSearchParams): void => {
		void navigate({
			search: serializeInvitationRouteSearchParams({
				...next,
				invite: search.invite,
			}),
			replace: true,
		});
	};

	const setInviteDrawerOpen = (isOpen: boolean): void => {
		void navigate({
			search: serializeInvitationRouteSearchParams({
				...search,
				invite: isOpen ? 1 : undefined,
			}),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: `${tenantId}:${search.status ?? ''}:${search.level ?? ''}`,
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
			level: search.level,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
		},
		{
			enabled: tenantId.length > 0,
		},
	);

	const handleRevoke = useCallback(
		async (row: StaffTenantInvitationRow) => {
			try {
				await revokeInvitation.mutateAsync({
					tenantId,
					invitationId: row.id,
				});
				await invalidateAllStaffTenantScopes(queryClient);
			} catch (error) {
				// Reset pending state on every exit path — no try/finally,
				// which the React Compiler cannot lower yet.
				if (shouldLogoutForFailure(error)) {
					setShouldRedirectToLogout(true);
					setPendingRevokeRowId(null);
					return;
				}
				setPendingRevokeRowId(null);
				return;
			}
			setPendingRevokeRowId(null);
		},
		[queryClient, revokeInvitation, tenantId],
	);

	const promptRevoke = useCallback((row: StaffTenantInvitationRow) => {
		setPendingRevokeRowId(row.id);
	}, []);

	const columns = useMemo(
		() =>
			createColumns({
				locale: i18n.language,
				t,
				isRevokePending: revokeInvitation.isPending,
				onRevoke: promptRevoke,
			}),
		[i18n.language, t, revokeInvitation.isPending, promptRevoke],
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
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
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

	const setStatuses = (nextStatuses: KnownInvitationStatus[]): void => {
		void navigate({
			search: serializeInvitationRouteSearchParams({
				...search,
				status: serializeInvitationStatusFilter(nextStatuses),
				cursor: undefined,
			}),
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
			: selectedStatuses
					.map((status) => formatTenantInvitationStatusLabel(status, t))
					.join(', ');

	const setLevels = (nextLevels: KnownInvitationAccountLevel[]): void => {
		void navigate({
			search: serializeInvitationRouteSearchParams({
				...search,
				level: serializeInvitationAccountLevelFilter(nextLevels),
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const toggleLevel = (level: KnownInvitationAccountLevel): void => {
		if (selectedLevels.includes(level)) {
			setLevels(selectedLevels.filter((value) => value !== level));
			return;
		}

		setLevels([...selectedLevels, level]);
	};

	const levelFilterLabel =
		selectedLevels.length === 0
			? t('all-account-levels')
			: selectedLevels
					.map((level) => formatTenantUserLevelLabel(level, t))
					.join(', ');

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
						{t('invitations')}
						{tenant.pendingInvitationsCount != null ? (
							<span className="ml-2 publy-profile-count-badge align-middle">
								{t('invitations-pending-count-chip', {
									count: tenant.pendingInvitationsCount,
								})}
							</span>
						) : null}
					</h2>
					<p className="publy-type-helper">
						{t('tenant-invitations-tab-description')}
					</p>
				</div>
				<Button
					type="button"
					size="sm"
					variant="default"
					onClick={() => setInviteDrawerOpen(true)}
				>
					<IconPlus aria-hidden="true" className="size-[15px]" />
					{t('invite-people')}
				</Button>
			</div>

			<ConfirmDialog
				isOpen={pendingRevokeRowId !== null}
				title={t('revoke-invitation')}
				description={t('revoke-invitation-confirm-description')}
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
				ariaLabel={t('tenant-invitations-table-aria-label')}
				columns={columns}
				rows={rows}
				isPending={invitationsQuery.isPending}
				isError={invitationsQuery.isError}
				onRetry={() => void invitationsQuery.refetch()}
				emptyIcon={IconMail}
				emptyTitle={t('tenant-invitations-empty-title')}
				emptyContent={t('tenant-invitations-empty-description')}
				emptyActions={
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setInviteDrawerOpen(true)}
					>
						<IconPlus aria-hidden="true" className="size-[15px]" />
						{t('invite-people')}
					</Button>
				}
				noMatchTitle={t('tenant-invitations-no-match-title')}
				noMatchContent={t('tenant-invitations-no-match-description')}
				hasActiveSearch={Boolean(
					controller.search.committed || search.status || search.level,
				)}
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
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										type="button"
										variant="outline"
										className="publy-data-table-filter-button max-w-64 text-[13px]"
										data-testid="staff-tenant-invitations-level-filter-trigger"
									/>
								}
							>
								<IconKey
									aria-hidden="true"
									className="size-[15px] text-[var(--publy-foreground-secondary)]"
								/>
								<span className="truncate">{levelFilterLabel}</span>
								<IconChevronDown aria-hidden="true" className="size-3" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={6}>
								<DropdownMenuCheckboxItem
									checked={selectedLevels.length === 0}
									closeOnClick
									data-testid="staff-tenant-invitations-level-filter-all"
									onCheckedChange={() => setLevels([])}
								>
									{t('all-account-levels')}
								</DropdownMenuCheckboxItem>
								{KNOWN_INVITATION_ACCOUNT_LEVELS.map((level) => (
									<DropdownMenuCheckboxItem
										key={level}
										checked={selectedLevels.includes(level)}
										closeOnClick={false}
										showCheckbox
										data-testid={`staff-tenant-invitations-level-filter-${level}`}
										onCheckedChange={() => toggleLevel(level)}
									>
										{formatTenantUserLevelLabel(level, t)}
									</DropdownMenuCheckboxItem>
								))}
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => setLevels([])}>
									{t('clear')}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										type="button"
										variant="outline"
										className="publy-data-table-filter-button max-w-64 text-[13px]"
										data-testid="staff-tenant-invitations-status-filter-trigger"
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
								<DropdownMenuCheckboxItem
									checked={selectedStatuses.length === 0}
									closeOnClick
									onCheckedChange={() => setStatuses([])}
								>
									{t('all-statuses')}
								</DropdownMenuCheckboxItem>
								{KNOWN_INVITATION_STATUSES.map((status) => (
									<DropdownMenuCheckboxItem
										key={status}
										checked={selectedStatuses.includes(status)}
										closeOnClick={false}
										showCheckbox
										data-testid={`staff-tenant-invitations-status-filter-${status}`}
										onCheckedChange={() => toggleStatus(status)}
									>
										{formatTenantInvitationStatusLabel(status, t)}
									</DropdownMenuCheckboxItem>
								))}
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => setStatuses([])}>
									{t('clear')}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				}
			/>

			<InviteTenantUserDrawerHost
				tenantId={tenantId}
				isOpen={isInviteDrawerOpen}
				onOpenChange={setInviteDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
			/>
		</TenantDetailsPageShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/invitations',
)({
	staticData: {
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{ kind: 'label', labelKey: 'common:invitations' },
		],
	},
	validateSearch: (search) =>
		serializeInvitationRouteSearchParams(
			parseInvitationRouteSearchParams(
				search as InvitationRouteSearchParamInput,
			),
		),
	component: StaffTenantInvitationsPage,
});
