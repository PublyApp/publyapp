import { IconAlertCircle, IconPlus } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { FloatingSelectionBar } from '~/components/table/floating-selection-bar';
import { Button } from '~/components/ui/button';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from './_tenant-details-shell';
import { RoleBulkActions } from './roles/_role-bulk-actions';
import {
	getRoleFormValues,
	roleFormResolver,
	type RoleFormValues,
} from './roles/_role-form-schema';
import { RoleTypeFilter, RoleViewToggle } from './roles/_role-list-controls';
import { RolesListBody } from './roles/_roles-list-body';
import { RolesPageDialogs } from './roles/_roles-page-dialogs';
import {
	parseStaffTenantRolesSearchParams,
	serializeStaffTenantRolesSearchParams,
	toStaffTenantRoleTypeFilterString,
	type StaffTenantRolesSearchParamInput,
	type StaffTenantRolesSearchParams,
} from './roles/_roles-search-params';
import { useStaffTenantRolesList } from './roles/_use-roles-list-state';

export { deriveTenantRoleCardStyle } from './roles/_role-card-style';
export { tenantRoleTypeChipClassName } from './roles/_role-type-chip';
export {
	parseStaffTenantRolesSearchParams,
	type StaffTenantRolesSearchParamInput,
} from './roles/_roles-search-params';

// Re-exported so route-local specs can type the mocked drawer's `methods`
// prop against the exact shape the page owns (develop #1306 contract).
export type { RoleFormValues as StaffTenantRoleFormValues };

const StaffTenantRolesPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseStaffTenantRolesSearchParams(
		Route.useSearch() as StaffTenantRolesSearchParamInput,
	);
	const { t } = useTranslation('common');

	// Both URL writers wrap `Route.useNavigate()` in `useCallback` and are
	// invoked exclusively from event handlers downstream — never during
	// render (`react-doctor/navigate-in-render`).
	const applySearch = useCallback(
		(next: StaffTenantRolesSearchParams): void => {
			void navigate({
				search: serializeStaffTenantRolesSearchParams(next),
				replace: true,
			});
		},
		[navigate],
	);

	const pushSearch = useCallback(
		(next: StaffTenantRolesSearchParams): void => {
			void navigate({
				search: serializeStaffTenantRolesSearchParams(next),
			});
		},
		[navigate],
	);

	const navigateToRole = useCallback(
		(roleId: string): void => {
			void navigate({
				to: '/staff/tenants/$tenantId/roles/$roleId',
				params: { tenantId, roleId },
			});
		},
		[navigate, tenantId],
	);

	// The create form lives here, not inside RoleFormDrawer: the nav guard
	// below reads `createMethods.formState.isDirty` during THIS component's
	// render, so blocking decisions never wait on a child effect to relay
	// dirtiness upward (tenants-r1-F2, develop #1306 contract). The drawer
	// re-seeds values by remounting under a fresh key.
	const roleFormResolverMemo = useMemo(() => roleFormResolver(t), [t]);
	const createMethods = useForm<RoleFormValues>({
		resolver: roleFormResolverMemo,
		defaultValues: getRoleFormValues(),
	});
	const {
		formState: { isDirty: isCreateFormDirty },
	} = createMethods;

	const list = useStaffTenantRolesList({
		tenantId,
		search,
		t,
		applySearch,
		pushSearch,
		navigateToRole,
		isCreateFormDirty,
	});
	const { controller, detailsQuery, rolesQuery, rows, selection } = list;

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
			/>
		);
	}

	if (rolesQuery.isError && shouldLogoutForFailure(rolesQuery.error)) {
		return <LogoutRedirect />;
	}

	if (list.shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	const testId = 'staff-tenant-roles-grid';
	const toolbarEnd = (
		<div className="flex items-center gap-2">
			<RoleTypeFilter
				value={toStaffTenantRoleTypeFilterString(search.is_full_access)}
				onChange={list.setTypeFilter}
				testId={testId}
				disabled={selection.isSelectionMode}
			/>
			<RoleViewToggle
				view={list.view}
				onChange={list.setView}
				testId={testId}
			/>
		</div>
	);

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="roles"
			testId="staff-tenant-roles-page"
			bodyScroll={list.view === 'table' ? 'contained' : 'page'}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<h2 className="publy-type-page-title">
						{t('roles')}
						{tenant.rolesCount != null ? (
							<span className="ml-2 publy-role-count-badge align-middle">
								{tenant.rolesCount}
							</span>
						) : null}
					</h2>
					<p className="publy-type-helper">
						{t('tenant-roles-tab-description')}
					</p>
				</div>
				<Button
					type="button"
					size="sm"
					onClick={() => list.setCreateDrawerOpen(true)}
				>
					<IconPlus aria-hidden="true" className="size-[15px]" />
					{t('new-role')}
				</Button>
			</div>

			<RolesListBody
				testId={testId}
				tenantId={tenantId}
				view={list.view}
				columns={list.columns}
				rows={rows}
				controller={controller}
				selection={selection}
				bodyState={list.bodyState}
				query={rolesQuery}
				hasActiveSearch={list.hasActiveSearch}
				nextCursor={rolesQuery.data?.nextCursor}
				onEditRequest={list.onEditRequest}
				onDeleteRequest={list.setDeleteTarget}
				onToggleCardSelection={list.toggleCardSelection}
				toolbarEnd={toolbarEnd}
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
				<RoleBulkActions
					tenantId={tenantId}
					rows={rows}
					selection={selection}
					onSessionExpired={() => list.setShouldRedirectToLogout(true)}
				/>
			</FloatingSelectionBar>

			<RolesPageDialogs
				tenantId={tenantId}
				deleteTarget={list.deleteTarget}
				isDeletePending={list.deleteRole.isPending}
				onDeleteConfirm={() => {
					void list.handleDelete();
				}}
				onDeleteDialogClose={() => list.setDeleteTarget(null)}
				isCreateDrawerOpen={list.isCreateDrawerOpen}
				onCreateDrawerOpenChange={list.setCreateDrawerOpen}
				createMethods={createMethods}
				onCreateSaved={list.onCreateSaved}
				editDrawerRole={list.editDrawerRole}
				isEditDrawerOpen={list.isEditDrawerOpen}
				onEditDrawerClose={list.closeEditDrawer}
				onEditDirtyChange={list.setIsEditFormDirty}
				onSessionExpired={() => list.setShouldRedirectToLogout(true)}
				blockerStatus={list.drawerBlocker.status}
				onBlockerProceed={list.drawerBlocker.proceed}
				onBlockerReset={list.drawerBlocker.reset}
			/>
		</TenantDetailsPageShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/roles',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-roles'],
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{ kind: 'label', labelKey: 'common:roles' },
		],
	},
	validateSearch: (search) =>
		serializeStaffTenantRolesSearchParams(
			parseStaffTenantRolesSearchParams(
				search as StaffTenantRolesSearchParamInput,
			),
		),
	component: StaffTenantRolesPage,
});
