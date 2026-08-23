import {
	IconAlertCircle,
	IconChevronDown,
	IconDownload,
	IconPlus,
	IconUserMinus,
	IconUsers,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import {
	FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME,
	FloatingSelectionBar,
} from '~/components/table/floating-selection-bar';
import {
	useRowSelection,
	type UseRowSelectionResult,
} from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { downloadFile, formatExportDateStamp } from '~/lib/download-file';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	toStaffTenantUserBulkActionSummary,
	toStaffTenantUserRows,
	useBulkRemoveStaffTenantUsersMutation,
	useExportStaffTenantUsersMutation,
	useStaffTenantUsersQuery,
	type StaffTenantUserRow,
} from '~/lib/query/staff-tenant-users';
import {
	invalidateAllStaffTenantScopes,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';
import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';
import { makeTenantUserColumns } from './_user-columns';
import {
	type KnownTenantUserLevel,
	type KnownTenantUserStatus,
	parseTenantUserLevelFilter,
	parseTenantUserStatusFilter,
	parseTenantUsersListSearchParams,
	serializeTenantUserLevelFilter,
	serializeTenantUserStatusFilter,
	serializeTenantUsersListSearchParams,
	type TenantUsersListSearchParamInput,
	type TenantUsersListSearchParams,
} from './_users-search-params';
import { TenantUsersToolbarFilters } from './_users-toolbar-filters';

// Re-exported for the route's test file (the search-params helpers live in
// `_users-search-params.tsx` so this route stays a single-component file).
export {
	parseTenantUserLevelFilter,
	parseTenantUserStatusFilter,
} from './_users-search-params';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/users',
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
			{ kind: 'label', labelKey: 'common:users' },
		],
	},
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

	// tenants-r6-F2: freeze the destructive selection target set — cancel a
	// pending search commit the moment selection mode starts (mirrors
	// invitations/index.tsx, staff-users.tsx, profiles.tsx); the level/status
	// filter triggers above are disabled for the same reason.
	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	const onUserSessionExpired = useCallback(() => setShouldLogout(true), []);
	const columns = useMemo(
		() => makeTenantUserColumns(tenantId, t, onUserSessionExpired),
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
					<TenantUsersToolbarFilters
						selectedLevels={selectedLevels}
						selectedStatuses={selectedStatuses}
						levelFilterLabel={levelFilterLabel}
						statusFilterLabel={statusFilterLabel}
						isLocked={selection.isSelectionMode}
						onSetLevels={setLevels}
						onToggleLevel={toggleLevel}
						onSetStatuses={setStatuses}
						onToggleStatus={toggleStatus}
					/>
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
				/>
			</FloatingSelectionBar>

			<InviteTenantUserDrawerHost
				tenantId={tenantId}
				isOpen={isInviteDrawerOpen}
				onOpenChange={setInviteDrawerOpen}
				onSessionExpired={() => setShouldLogout(true)}
			/>
		</TenantDetailsPageShell>
	);
}

const TenantUserBulkActions = ({
	tenantId,
	tenantCode,
	rows,
	selection,
	onSessionExpired,
}: {
	tenantId: string;
	tenantCode: string | null;
	rows: StaffTenantUserRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
	const bulkRemoveMutation = useBulkRemoveStaffTenantUsersMutation();
	const exportMutation = useExportStaffTenantUsersMutation();

	const selectedIds: string[] = [];
	for (const row of rows) {
		if (selection.rowSelection[row.id]) {
			selectedIds.push(row.id);
		}
	}
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const isActionPending =
		bulkRemoveMutation.isPending || exportMutation.isPending;

	const performExport = async () => {
		if (selectedIds.length === 0 || isOverLimit) {
			toastLocalMutationResult.error(t('export-failed'));
			return;
		}

		let data: ArrayBuffer | undefined;
		try {
			data = await exportMutation.mutateAsync({ tenantId, ids: selectedIds });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(error, t('export-failed'));
			return;
		}

		if (!data) {
			toastLocalMutationResult.error(t('export-failed'));
			return;
		}

		try {
			downloadFile({
				data,
				fileName: `${tenantCode ?? tenantId}-members-${formatExportDateStamp(new Date())}.csv`,
				mimeType: 'text/csv',
			});
		} catch {
			toastLocalMutationResult.error(t('export-failed'));
			return;
		}

		toastLocalMutationResult.success(t('export-completed-success'));
	};

	const performBulkRemove = async () => {
		if (selectedIds.length === 0 || isOverLimit) {
			toastLocalMutationResult.error(t('tenant-user-bulk-remove-failure'));
			return;
		}

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

			await displayLocalMutationFailure(
				error,
				t('tenant-user-bulk-remove-failure'),
			);
			return;
		}

		setIsRemoveDialogOpen(false);
		selection.clearSelection();
		await invalidateAllStaffTenantScopes(queryClient);

		const summary = toStaffTenantUserBulkActionSummary(result);
		if (summary.failedCount === 0) {
			toastLocalMutationResult.success(
				t('tenant-user-bulk-remove-success', {
					count: summary.succeededCount,
				}),
			);
			return;
		}

		toastLocalMutationResult.error(
			summary.succeededCount === 0
				? t('tenant-user-bulk-remove-failure')
				: t('tenant-user-bulk-remove-partial-success', {
						succeeded: summary.succeededCount,
						failed: summary.failedCount,
					}),
		);
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
