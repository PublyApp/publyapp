import { IconAlertCircle } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import {
	toStaffTenantUserRows,
	useStaffTenantUsersQuery,
} from '~/lib/query/staff-tenant-users';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';
import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';
import { TenantUserBulkActions } from './_users-bulk-actions';
import { makeTenantUserColumns } from './_users-columns';
import { TenantUsersFilterMenus } from './_users-filter-menus';
import { TenantUsersPageHeader } from './_users-page-header';
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
import { TenantUsersTable } from './_users-table';

// Re-exported for the route's test file (the search-params helpers live in
// `_users-search-params.tsx` so this route stays a single-component file).
export {
	parseTenantUserLevelFilter,
	parseTenantUserStatusFilter,
} from './_users-search-params';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffTenantUsersPage = () => {
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

	// Plain function: the React Compiler caches the columns per value, so a
	// stable handler identity is not needed — and the empty-deps useCallback
	// here triggered a preserve-memo diagnostic that skipped the component.
	const onUserSessionExpired = () => setShouldLogout(true);
	const columns = makeTenantUserColumns(tenantId, t, onUserSessionExpired);

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	// Hoisted so the fatal-error gates read plain locals, not query flags —
	// QueryDisplay owns the loading/error/data rendering below.
	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const usersError = usersQuery.error;
	if (usersError !== null && shouldLogoutForFailure(usersError)) {
		return <LogoutRedirect />;
	}

	const renderTenantMissingSlot = (
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

	return (
		<QueryDisplay
			query={detailsQuery}
			LoadingSlot={<TenantDetailsLoading />}
			ErrorSlot={
				<TenantDetailsError
					error={detailsError}
					onRetry={() => void detailsQuery.refetch()}
				/>
			}
		>
			{() => {
				const tenant = toStaffTenantDetails(detailsQuery.data);
				if (!tenant) {
					return renderTenantMissingSlot;
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
						<TenantUsersPageHeader
							usersCount={tenant.usersCount}
							onInvite={() => setInviteDrawerOpen(true)}
						/>

						<TenantUsersTable
							columns={columns}
							rows={rows}
							controller={controller}
							selection={selection}
							hasActiveFilters={Boolean(
								controller.search.committed || search.status || search.level,
							)}
							queryState={{
								isPending: usersQuery.isPending,
								isError: usersQuery.isError,
								isFetching: usersQuery.isFetching,
								hasNextPage: usersQuery.data?.nextCursor != null,
							}}
							nextCursor={usersQuery.data?.nextCursor ?? undefined}
							onRetry={() => void usersQuery.refetch()}
							onInvite={() => setInviteDrawerOpen(true)}
							toolbarEnd={
								<TenantUsersFilterMenus
									selectedLevels={selectedLevels}
									selectedStatuses={selectedStatuses}
									levelFilterLabel={levelFilterLabel}
									statusFilterLabel={statusFilterLabel}
									isSelectionMode={selection.isSelectionMode}
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
								rows.length > 0 &&
								rows.every((row) => selection.rowSelection[row.id])
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
			}}
		</QueryDisplay>
	);
};

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
