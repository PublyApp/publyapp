import { IconAlertCircle } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { useRowSelection } from '~/components/table/use-row-selection';
import {
	buildTableApiVariables,
	useTableController,
} from '~/components/table/use-table-controller';
import {
	preloadRouteQueries,
	type RouteQuerySpecEntry,
} from '~/lib/query/route-preload';
import {
	staffTenantUsersQueryOptions,
	toStaffTenantUserRows,
	useStaffTenantUsersQuery,
} from '~/lib/query/staff-tenant-users';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	staffTenantDetailsQueryOptions,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';
import { inviteRolesQuery } from './_queries';
import {
	formatTenantUserStatusLabel,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from './_tenant-details-shell';
import { TenantUserBulkActions } from './_users-bulk-actions';
import { makeTenantUserColumns } from './_users-columns';
import { TenantUsersFilterMenus } from './_users-filter-menus';
import { TenantUsersPageHeader } from './_users-page-header';
import {
	deriveTenantUserRoleKey,
	type KnownTenantUserRole,
	type KnownTenantUserStatus,
	parseTenantUserRoleFilter,
	parseTenantUserStatusFilter,
	parseTenantUsersListSearchParams,
	serializeTenantUserRoleFilter,
	serializeTenantUserStatusFilter,
	serializeTenantUsersListSearchParams,
	type TenantUsersListSearchParamInput,
	type TenantUsersListSearchParams,
} from './_users-search-params';
import { TenantUsersTable } from './_users-table';

// Re-exported for the route's test file (the search-params helpers live in
// `_users-search-params.tsx` so this route stays a single-component file).
export {
	parseTenantUserRoleFilter,
	parseTenantUserStatusFilter,
} from './_users-search-params';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

/** The page's queries, declared once: the loader warms them and the page reads
 * the same variables. The cursor lives in React state, so the loader warms the
 * first page (decision 4). */
const tenantUsersQueries = ({
	tenantId,
	search,
}: {
	tenantId: string;
	search: TenantUsersListSearchParams;
}) => {
	const { q, sortId, sortOrder, size } = buildTableApiVariables(
		search,
		DEFAULT_SORT,
		DEFAULT_SIZE,
	);
	const details = {
		options: staffTenantDetailsQueryOptions,
		variables: { tenantId },
	};
	const users = {
		options: staffTenantUsersQueryOptions,
		variables: { tenantId, q, status: search.status, sortId, sortOrder, size },
	};
	const roles = inviteRolesQuery(tenantId);

	// The role picker lives in the invite drawer, which only mounts on
	// `?invite=1`: without it the page never reads the roles query.
	const spec: Record<string, RouteQuerySpecEntry> =
		search.invite === 1 ? { details, roles, users } : { details, users };

	return { details, users, spec };
};

const StaffTenantUsersPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseTenantUsersListSearchParams(
		Route.useSearch() as TenantUsersListSearchParamInput,
	);
	const { t } = useTranslation('common');
	const [shouldLogout, setShouldLogout] = useState(false);
	// #2291 M5: the drawer's Escape/close returns focus to this button.
	const inviteButtonRef = useRef<HTMLButtonElement>(null);

	const selectedStatuses = parseTenantUserStatusFilter(search.status);
	const selectedRoles = parseTenantUserRoleFilter(search.role);
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
		cursorResetKey: `${tenantId}:${search.status ?? ''}:${search.role ?? ''}`,
	});
	const queries = tenantUsersQueries({ tenantId, search });
	const detailsQuery = useStaffTenantDetailsQuery(queries.details.variables, {
		enabled: tenantId.length > 0,
	});
	const usersQuery = useStaffTenantUsersQuery(
		{
			...queries.users.variables,
			// The cursor lives in React state: the loader warms the first page.
			cursor: controller.apiVariables.cursor,
		},
		{
			enabled: tenantId.length > 0,
		},
	);

	const allRows = toStaffTenantUserRows(usersQuery.data?.data);
	// ponytail: no server-side role filter — narrow the loaded page only, same
	// trade-off as the staff-users list filters.
	const selectedRoleKeys = new Set(selectedRoles);
	const rows =
		selectedRoleKeys.size === 0
			? allRows
			: allRows.filter((row) =>
					selectedRoleKeys.has(deriveTenantUserRoleKey(row.isFullAccess)),
				);
	const selection = useRowSelection(rows.map((row) => row.id));

	// tenants-r6-F2: freeze the destructive selection target set — cancel a
	// pending search commit the moment selection mode starts (mirrors
	// invitations/index.tsx, staff-users.tsx, roles.tsx); the role/status
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

				const setRoles = (nextRoles: KnownTenantUserRole[]): void => {
					void navigate({
						search: serializeTenantUsersListSearchParams({
							...search,
							role: serializeTenantUserRoleFilter(nextRoles),
							cursor: undefined,
						}),
						replace: true,
					});
				};

				const toggleRole = (role: KnownTenantUserRole): void => {
					if (selectedRoles.includes(role)) {
						setRoles(selectedRoles.filter((value) => value !== role));
						return;
					}

					setRoles([...selectedRoles, role]);
				};

				const roleFilterLabel =
					selectedRoles.length === 0
						? t('all-roles')
						: selectedRoles
								.map((role) =>
									role === 'full_access'
										? t('full-access')
										: t('standard-access'),
								)
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
							inviteButtonRef={inviteButtonRef}
						/>

						<TenantUsersTable
							columns={columns}
							rows={rows}
							controller={controller}
							selection={selection}
							hasActiveFilters={Boolean(
								controller.search.committed || search.status || search.role,
							)}
							query={usersQuery}
							nextCursor={usersQuery.data?.nextCursor ?? undefined}
							onInvite={() => setInviteDrawerOpen(true)}
							toolbarEnd={
								<TenantUsersFilterMenus
									selectedRoles={selectedRoles}
									selectedStatuses={selectedStatuses}
									roleFilterLabel={roleFilterLabel}
									statusFilterLabel={statusFilterLabel}
									isSelectionMode={selection.isSelectionMode}
									onSetRoles={setRoles}
									onToggleRole={toggleRole}
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
							finalFocusRef={inviteButtonRef}
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
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps, params }) => {
		preloadRouteQueries(
			context.queryClient,
			tenantUsersQueries({
				tenantId: params.tenantId,
				search: parseTenantUsersListSearchParams(
					deps as TenantUsersListSearchParamInput,
				),
			}).spec,
		);
	},
	component: StaffTenantUsersPage,
});
