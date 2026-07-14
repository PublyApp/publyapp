import {
	IconAlertCircle,
	IconChevronDown,
	IconCircleDot,
	IconDownload,
	IconEye,
	IconKey,
	IconPencil,
	IconPlus,
	IconRefresh,
	IconTrash,
	IconUserMinus,
	IconUsers,
	IconUserX,
	IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
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
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { downloadFile, formatExportDateStamp } from '~/lib/download-file';
import {
	toStaffTenantUserBulkActionSummary,
	toStaffTenantUserRows,
	useBulkRemoveStaffTenantUsersMutation,
	useExportStaffTenantUsersMutation,
	useReactivateStaffTenantUserMutation,
	useRemoveStaffTenantUserMutation,
	useStaffTenantUsersQuery,
	useSuspendStaffTenantUserMutation,
	type StaffTenantUserRow,
} from '~/lib/query/staff-tenant-users';
import {
	invalidateAllStaffTenantScopes,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
} from '~/lib/url-state/table-search-params';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import { InviteTenantUserDrawer } from './_invite-user-drawer';
import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
	tenantUserLevelChipClassName,
} from './_tenant-details-shell';

export {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	tenantUserLevelChipClassName,
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

export const KNOWN_TENANT_USER_STATUSES = [
	'active',
	'suspended',
	'globally_suspended',
] as const;

export type KnownTenantUserStatus = (typeof KNOWN_TENANT_USER_STATUSES)[number];

const KNOWN_TENANT_USER_STATUS_SET = new Set<string>(
	KNOWN_TENANT_USER_STATUSES,
);

export const KNOWN_TENANT_USER_LEVELS = ['admin', 'user'] as const;

export type KnownTenantUserLevel = (typeof KNOWN_TENANT_USER_LEVELS)[number];

const KNOWN_TENANT_USER_LEVEL_SET = new Set<string>(KNOWN_TENANT_USER_LEVELS);

export type TenantUsersListSearchParams = TableSearchParams & {
	status?: string;
	level?: string;
	invite?: 1;
};

export type TenantUsersListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	level?: unknown;
	invite?: unknown;
};

const normalizeString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

export const parseTenantUserStatusFilter = (
	value: unknown,
): KnownTenantUserStatus[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<KnownTenantUserStatus>();
	const statuses: KnownTenantUserStatus[] = [];

	for (const part of normalized.split(',')) {
		const candidate = part.trim().toLowerCase();
		if (!KNOWN_TENANT_USER_STATUS_SET.has(candidate)) {
			continue;
		}

		const status = candidate as KnownTenantUserStatus;
		if (seen.has(status)) {
			continue;
		}

		seen.add(status);
		statuses.push(status);
	}

	return statuses;
};

export const serializeTenantUserStatusFilter = (
	statuses: KnownTenantUserStatus[],
): string | undefined => (statuses.length > 0 ? statuses.join(',') : undefined);

export const parseTenantUserLevelFilter = (
	value: unknown,
): KnownTenantUserLevel[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<KnownTenantUserLevel>();
	const levels: KnownTenantUserLevel[] = [];

	for (const part of normalized.split(',')) {
		const candidate = part.trim().toLowerCase();
		if (!KNOWN_TENANT_USER_LEVEL_SET.has(candidate)) {
			continue;
		}

		const level = candidate as KnownTenantUserLevel;
		if (seen.has(level)) {
			continue;
		}

		seen.add(level);
		levels.push(level);
	}

	return levels;
};

export const serializeTenantUserLevelFilter = (
	levels: KnownTenantUserLevel[],
): string | undefined => (levels.length > 0 ? levels.join(',') : undefined);

/** The flag round-trips as the NUMBER 1 — a string '1' would be JSON-quoted
 * in the URL (`?invite=%221%22`) by the router's search serializer. */
export const parseTenantUserInviteFlag = (value: unknown): 1 | undefined =>
	value === 1 || normalizeString(value) === '1' ? 1 : undefined;

export const parseTenantUsersListSearchParams = (
	search: TenantUsersListSearchParamInput,
): TenantUsersListSearchParams => {
	const base = parseTableSearchParams(search);
	const status = serializeTenantUserStatusFilter(
		parseTenantUserStatusFilter(search.status),
	);
	const level = serializeTenantUserLevelFilter(
		parseTenantUserLevelFilter(search.level),
	);
	const invite = parseTenantUserInviteFlag(search.invite);

	return {
		...base,
		status,
		level,
		invite,
	};
};

export const serializeTenantUsersListSearchParams = (
	params: TenantUsersListSearchParams,
): Record<string, string | 1 | undefined> => {
	const next = serializeTableSearchParams(params);
	const status = serializeTenantUserStatusFilter(
		parseTenantUserStatusFilter(params.status),
	);
	const level = serializeTenantUserLevelFilter(
		parseTenantUserLevelFilter(params.level),
	);
	const invite = parseTenantUserInviteFlag(params.invite);

	return {
		...next,
		status: status || undefined,
		level: level || undefined,
		invite,
	};
};

type TenantUserPendingAction = 'suspend' | 'reactivate' | 'remove' | null;

const getNormalizedTenantUserStatus = (
	value: string | null | undefined,
): string => value?.trim().toLowerCase() ?? '';

const TenantUserRowActions = ({
	tenantId,
	user,
	onSessionExpired,
	onFeedback,
}: {
	tenantId: string;
	user: StaffTenantUserRow;
	onSessionExpired: () => void;
	onFeedback: (feedback: TenantUserBulkFeedback) => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<TenantUserPendingAction>(null);
	const suspendMutation = useSuspendStaffTenantUserMutation();
	const reactivateMutation = useReactivateStaffTenantUserMutation();
	const removeMutation = useRemoveStaffTenantUserMutation();

	const normalizedStatus = getNormalizedTenantUserStatus(user.status);
	const canSuspend = normalizedStatus === 'active';
	const canReactivate = normalizedStatus === 'suspended';
	const isActionPending =
		suspendMutation.isPending ||
		reactivateMutation.isPending ||
		removeMutation.isPending;

	const invalidateTenantUserQueries = () =>
		invalidateAllStaffTenantScopes(queryClient);

	const performAction = async (action: 'suspend' | 'reactivate' | 'remove') => {
		try {
			if (action === 'suspend') {
				await suspendMutation.mutateAsync({ tenantId, userId: user.id });
			} else if (action === 'reactivate') {
				await reactivateMutation.mutateAsync({ tenantId, userId: user.id });
			} else {
				await removeMutation.mutateAsync({ tenantId, userId: user.id });
			}

			await invalidateTenantUserQueries();
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			onFeedback({
				tone: 'error',
				message: getFailureMessage(toApiFailure(error), {
					fallback: t('unable-to-update-tenant-user'),
				}),
			});
		} finally {
			setPendingAction(null);
		}
	};

	const dialogConfig = (() => {
		if (pendingAction === 'suspend') {
			return {
				title: t('suspend'),
				description: t('suspend-tenant-user-description'),
				confirmLabel: t('suspend'),
			};
		}
		if (pendingAction === 'reactivate') {
			return {
				title: t('reactivate'),
				description: t('reactivate-tenant-user-description'),
				confirmLabel: t('reactivate'),
			};
		}
		return {
			title: t('remove-user-from-tenant'),
			description: t('confirm-remove-user-from-tenant-details'),
			confirmLabel: t('remove-user-from-tenant'),
		};
	})();

	return (
		<div className="flex flex-col items-center gap-1">
			<DataTableRowActions
				ariaLabel={t('actions-for', { name: user.displayName })}
				testId={`staff-tenant-user-actions-${user.id}`}
			>
				<DropdownMenuItem
					render={
						<Link
							to="/staff/tenants/$tenantId/users/$userId"
							params={{ tenantId, userId: user.id }}
						/>
					}
				>
					<IconEye className="size-[15px]" />
					{t('view-details')}
				</DropdownMenuItem>
				<DropdownMenuItem
					render={
						<Link
							to="/staff/tenants/$tenantId/users/$userId/edit"
							params={{ tenantId, userId: user.id }}
						/>
					}
				>
					<IconPencil className="size-[15px]" />
					{t('edit')}
				</DropdownMenuItem>
				{canReactivate ? (
					<DropdownMenuItem
						disabled={isActionPending}
						onClick={() => setPendingAction('reactivate')}
					>
						<IconRefresh className="size-[15px]" />
						{t('reactivate')}
					</DropdownMenuItem>
				) : null}
				{canSuspend ? (
					<DropdownMenuItem
						variant="destructive"
						disabled={isActionPending}
						onClick={() => setPendingAction('suspend')}
					>
						<IconUserX className="size-[15px]" />
						{t('suspend')}
					</DropdownMenuItem>
				) : null}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					disabled={isActionPending}
					onClick={() => setPendingAction('remove')}
				>
					<IconTrash className="size-[15px]" />
					{t('remove-user-from-tenant')}
				</DropdownMenuItem>
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

export const makeTenantUserColumns = (
	tenantId: string,
	t: (key: string) => string,
	onSessionExpired: () => void,
	onFeedback: (feedback: TenantUserBulkFeedback) => void,
): ColumnDef<StaffTenantUserRow>[] => [
	{
		id: 'name',
		header: t('members'),
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/staff/tenants/$tenantId/users/$userId"
				params={{ tenantId, userId: row.original.id }}
				className="flex min-w-0 items-center gap-2.5 no-underline"
			>
				<InitialsAvatar name={row.original.displayName} />
				<span className="min-w-0 space-y-0.5">
					<span
						className="publy-record-link block truncate text-[13px] font-medium"
						title={row.original.displayName}
					>
						{row.original.displayName}
					</span>
					<span
						className="block truncate text-xs text-muted-foreground"
						title={row.original.email || undefined}
					>
						{row.original.email || '—'}
					</span>
				</span>
			</Link>
		),
	},
	{
		id: 'level',
		header: t('level'),
		accessorKey: 'level',
		meta: { width: '150px', hideBelow: 768 },
		cell: ({ getValue }) => {
			const level = getValue<string | null>();
			return (
				<span className={tenantUserLevelChipClassName(level)}>
					{formatTenantUserLevelLabel(level, t)}
				</span>
			);
		},
	},
	{
		id: 'status',
		header: t('status'),
		accessorKey: 'status',
		meta: { width: '130px' },
		cell: ({ getValue }) => {
			const status = getValue<string | null>();
			return (
				<StatusPill tone={statusPillTone(status)}>
					{formatTenantUserStatusLabel(status, t)}
				</StatusPill>
			);
		},
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">{t('actions')}</span>,
		enableSorting: false,
		meta: { width: '40px', align: 'center' },
		cell: ({ row }) => (
			<TenantUserRowActions
				tenantId={tenantId}
				user={row.original}
				onSessionExpired={onSessionExpired}
				onFeedback={onFeedback}
			/>
		),
	},
];

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users',
)({
	validateSearch: (search) =>
		serializeTenantUsersListSearchParams(
			parseTenantUsersListSearchParams(
				search as TenantUsersListSearchParamInput,
			),
		),
	component: StaffTenantUsersPage,
});

function StaffTenantUsersPage() {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseTenantUsersListSearchParams(
		Route.useSearch() as TenantUsersListSearchParamInput,
	);
	const { t } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);
	const [bulkFeedback, setBulkFeedback] =
		useState<TenantUserBulkFeedback | null>(null);

	const selectedStatuses = parseTenantUserStatusFilter(search.status);
	const selectedLevels = parseTenantUserLevelFilter(search.level);
	const isInviteDrawerOpen = search.invite === 1;

	const onSearchChange = (next: TenantUsersListSearchParams): void => {
		void navigate({
			search: serializeTenantUsersListSearchParams(next),
			replace: true,
		});
	};

	const setInviteDrawerOpen = (isOpen: boolean): void => {
		void navigate({
			search: serializeTenantUsersListSearchParams({
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
	const usersQuery = useStaffTenantUsersQuery(
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

	const rows = toStaffTenantUserRows(usersQuery.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const onUserSessionExpired = useCallback(() => setShouldLogout(true), []);
	const columns = useMemo(
		() =>
			makeTenantUserColumns(tenantId, t, onUserSessionExpired, setBulkFeedback),
		[tenantId, t, onUserSessionExpired],
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

	if (usersQuery.isError && shouldLogoutForFailure(usersQuery.error)) {
		return <LogoutRedirect />;
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const setStatuses = (nextStatuses: KnownTenantUserStatus[]): void => {
		void navigate({
			search: serializeTenantUsersListSearchParams({
				...search,
				status: serializeTenantUserStatusFilter(nextStatuses),
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const toggleStatus = (status: KnownTenantUserStatus): void => {
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
					.map((status) => formatTenantUserStatusLabel(status, t))
					.join(', ');

	const setLevels = (nextLevels: KnownTenantUserLevel[]): void => {
		void navigate({
			search: serializeTenantUsersListSearchParams({
				...search,
				level: serializeTenantUserLevelFilter(nextLevels),
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const toggleLevel = (level: KnownTenantUserLevel): void => {
		if (selectedLevels.includes(level)) {
			setLevels(selectedLevels.filter((value) => value !== level));
			return;
		}

		setLevels([...selectedLevels, level]);
	};

	const levelFilterLabel =
		selectedLevels.length === 0
			? t('all-levels')
			: selectedLevels
					.map((level) => formatTenantUserLevelLabel(level, t))
					.join(', ');

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="users"
			testId="staff-tenant-users-page"
			bodyScroll="contained"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<h2 className="publy-type-page-title">
						{t('members')}
						{tenant.usersCount != null ? (
							<span className="ml-2 publy-profile-count-badge align-middle">
								{tenant.usersCount}
							</span>
						) : null}
					</h2>
					<p className="publy-type-helper">
						{t('tenant-users-tab-description')}
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

			<DataTable<StaffTenantUserRow>
				testId="staff-tenant-users-table"
				ariaLabel={t('tenant-users-table-aria-label')}
				columns={columns}
				rows={rows}
				getRowLabel={(row) => row.displayName}
				isPending={usersQuery.isPending}
				isError={usersQuery.isError}
				onRetry={() => void usersQuery.refetch()}
				emptyIcon={IconUsers}
				emptyTitle={t('tenant-users-empty-title')}
				emptyContent={t('tenant-users-empty-description')}
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
				noMatchTitle={t('tenant-users-no-match-title')}
				noMatchContent={t('tenant-users-no-match-description')}
				hasActiveSearch={Boolean(
					controller.search.committed || search.status || search.level,
				)}
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
				searchPlaceholder={t('search-tenant-members')}
				selection={selection}
				toolbarEnd={
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										type="button"
										variant="outline"
										className="publy-data-table-filter-button max-w-64 text-[13px]"
										data-testid="staff-tenant-users-level-filter-trigger"
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
									data-testid="staff-tenant-users-level-filter-all"
									onCheckedChange={() => setLevels([])}
								>
									{t('all-levels')}
								</DropdownMenuCheckboxItem>
								{KNOWN_TENANT_USER_LEVELS.map((level) => (
									<DropdownMenuCheckboxItem
										key={level}
										checked={selectedLevels.includes(level)}
										closeOnClick={false}
										showCheckbox
										data-testid={`staff-tenant-users-level-filter-${level}`}
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
										data-testid="staff-tenant-users-status-filter-trigger"
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
									data-testid="staff-tenant-users-status-filter-all"
									onCheckedChange={() => setStatuses([])}
								>
									{t('all-statuses')}
								</DropdownMenuCheckboxItem>
								{KNOWN_TENANT_USER_STATUSES.map((status) => (
									<DropdownMenuCheckboxItem
										key={status}
										checked={selectedStatuses.includes(status)}
										closeOnClick={false}
										showCheckbox
										onCheckedChange={() => toggleStatus(status)}
									>
										{formatTenantUserStatusLabel(status, t)}
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
				<TenantUserBulkActions
					tenantId={tenantId}
					tenantCode={tenant.code}
					rows={rows}
					selection={selection}
					onSessionExpired={() => setShouldLogout(true)}
					onFeedback={setBulkFeedback}
				/>
			</FloatingSelectionBar>

			<InviteTenantUserDrawer
				tenantId={tenantId}
				isOpen={isInviteDrawerOpen}
				onOpenChange={setInviteDrawerOpen}
				onSessionExpired={() => setShouldLogout(true)}
				onInvited={() => {
					void navigate({
						to: '/staff/tenants/$tenantId/invitations',
						params: { tenantId },
					});
				}}
			/>
		</TenantDetailsPageShell>
	);
}

type TenantUserBulkFeedback = {
	tone: 'success' | 'error';
	message: string;
};

const bulkFeedbackToneClassName = (
	tone: TenantUserBulkFeedback['tone'],
): string =>
	tone === 'error' ? 'text-destructive' : 'text-[var(--publy-success)]';

const TenantUserBulkActions = ({
	tenantId,
	tenantCode,
	rows,
	selection,
	onSessionExpired,
	onFeedback,
}: {
	tenantId: string;
	tenantCode: string | null;
	rows: StaffTenantUserRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
	onFeedback: (feedback: TenantUserBulkFeedback | null) => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
	const bulkRemoveMutation = useBulkRemoveStaffTenantUsersMutation();
	const exportMutation = useExportStaffTenantUsersMutation();

	const selectedIds = rows
		.filter((row) => selection.rowSelection[row.id])
		.map((row) => row.id);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const isActionPending =
		bulkRemoveMutation.isPending || exportMutation.isPending;

	const performExport = async () => {
		onFeedback(null);

		let data: ArrayBuffer | undefined;
		try {
			data = await exportMutation.mutateAsync({ tenantId, ids: selectedIds });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			onFeedback({
				tone: 'error',
				message: getFailureMessage(toApiFailure(error), {
					fallback: t('export-failed'),
				}),
			});
			return;
		}

		if (!data) {
			return;
		}

		downloadFile({
			data,
			fileName: `${tenantCode ?? tenantId}-members-${formatExportDateStamp(new Date())}.csv`,
			mimeType: 'text/csv',
		});
	};

	const performBulkRemove = async () => {
		onFeedback(null);

		let result;
		try {
			result = await bulkRemoveMutation.mutateAsync({
				tenantId,
				userIds: selectedIds,
			});
		} catch (error) {
			setIsRemoveDialogOpen(false);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			onFeedback({
				tone: 'error',
				message: getFailureMessage(toApiFailure(error), {
					fallback: t('tenant-user-bulk-remove-failure'),
				}),
			});
			return;
		}

		setIsRemoveDialogOpen(false);
		selection.clearSelection();
		await invalidateAllStaffTenantScopes(queryClient);

		const summary = toStaffTenantUserBulkActionSummary(result);
		onFeedback({
			tone: summary.failedCount > 0 ? 'error' : 'success',
			message:
				summary.failedCount > 0
					? t('tenant-user-bulk-remove-partial-success', {
							succeeded: summary.succeededCount,
							failed: summary.failedCount,
						})
					: t('tenant-user-bulk-remove-success', {
							count: summary.succeededCount,
						}),
		});
	};

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
						onClick={() => {
							void performExport();
						}}
					>
						<IconDownload />
						{t('export-selected-users')}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						disabled={isActionPending}
						onClick={() => setIsRemoveDialogOpen(true)}
					>
						<IconUserMinus />
						{t('remove-selected-from-tenant')}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={isRemoveDialogOpen}
				title={t('remove-selected-from-tenant')}
				description={t('confirm-bulk-remove-tenant-users', {
					count: selectedCount,
				})}
				confirmLabel={t('remove')}
				isPending={bulkRemoveMutation.isPending}
				onConfirm={() => {
					void performBulkRemove();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setIsRemoveDialogOpen(false);
				}}
			/>
		</>
	);
};
