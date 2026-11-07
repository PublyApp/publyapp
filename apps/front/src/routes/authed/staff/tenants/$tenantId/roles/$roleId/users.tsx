import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import {
	selectStaffTenantRoleCrumbName,
	staffTenantRoleCrumbQuery,
	toStaffTenantRoleDetails,
} from '~/lib/query/staff-tenant-roles';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
} from '~/lib/query/staff-tenants';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../../_tenant-details-shell';
import { AssignMembersDrawer } from './_assign-members-drawer';
import {
	RoleMembersLoading,
	RoleMissingSlot,
	TenantMissingSlot,
	TenantRoleMembersError,
} from './_members-error-views';
import {
	parseRoleMembersSearchParams,
	serializeRoleMembersSearchParams,
	type RoleMembersSearchParamInput,
	type RoleMembersSearchParams,
} from './_role-members-search';
import { RoleMembersView } from './_role-members-view';
import { useStaffTenantRoleMembers } from './_use-role-members-state';

export { makeRoleMemberColumns } from '../_role-member-columns';
export {
	parseRoleMembersSearchParams,
	serializeRoleMembersSearchParams,
	type RoleMembersSearchParamInput,
} from './_role-members-search';

const StaffTenantRoleMembersPage = () => {
	const { tenantId, roleId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation(['common', 'staff-tenant-roles']);

	// Both URL writers wrap `Route.useNavigate()` in `useCallback` and are
	// invoked exclusively from event handlers downstream — never during
	// render (`react-doctor/navigate-in-render`).
	const setAssignDrawerOpen = useCallback(
		(isOpen: boolean): void => {
			void navigate({
				search: (previous: RoleMembersSearchParams) =>
					serializeRoleMembersSearchParams({
						...previous,
						assign: isOpen ? 1 : undefined,
					}),
				replace: true,
			});
		},
		[navigate],
	);
	const onMembersSearchChange = useCallback(
		(next: TableSearchParams): void => {
			void navigate({
				search: serializeRoleMembersSearchParams({
					...next,
					assign: search.assign,
				}),
				replace: true,
			});
		},
		[navigate, search.assign],
	);

	const members = useStaffTenantRoleMembers({
		tenantId,
		roleId,
		search,
		setAssignDrawerOpen,
		onMembersSearchChange,
		t,
		language: i18n.language,
	});
	const {
		detailQuery,
		isAssignDrawerOpen,
		memberColumns,
		memberRows,
		membersController,
		membersPageIndex,
		membersQuery,
		setShouldRedirectToLogout,
		shouldRedirectToLogout,
		tenantQuery,
	} = members;

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	// Hoisted so the fatal-error gates read plain locals, not query flags —
	// QueryDisplay owns the loading/error/data rendering below.
	const tenantError = tenantQuery.error;
	if (tenantError !== null && shouldLogoutForFailure(tenantError)) {
		return <LogoutRedirect />;
	}

	const detailError = detailQuery.error;
	if (detailError !== null && shouldLogoutForFailure(detailError)) {
		return <LogoutRedirect />;
	}

	const tenant = toStaffTenantDetails(tenantQuery.data);
	const role = toStaffTenantRoleDetails(detailQuery.data);

	return (
		<QueryDisplay
			query={tenantQuery}
			LoadingSlot={<TenantDetailsLoading />}
			ErrorSlot={
				<TenantDetailsError
					error={tenantError}
					onRetry={() => void tenantQuery.refetch()}
				/>
			}
			EmptySlot={
				<TenantMissingSlot onRetry={() => void tenantQuery.refetch()} />
			}
		>
			{() => {
				if (!tenant) {
					return (
						<TenantMissingSlot onRetry={() => void tenantQuery.refetch()} />
					);
				}

				return (
					<QueryDisplay
						query={detailQuery}
						LoadingSlot={<RoleMembersLoading />}
						ErrorSlot={({ error }) => (
							<TenantRoleMembersError
								error={error}
								onRetry={() => void detailQuery.refetch()}
							/>
						)}
						EmptySlot={<RoleMissingSlot />}
					>
						{() => {
							if (!role) {
								return <RoleMissingSlot />;
							}

							return (
								<TenantDetailsPageShell
									tenant={tenant}
									activeSection="roles"
									testId="staff-tenant-role-members-page"
									bodyScroll="contained"
								>
									<RoleMembersView
										tenantId={tenantId}
										roleId={roleId}
										t={t}
										role={role}
										memberColumns={memberColumns}
										memberRows={memberRows}
										membersQuery={membersQuery}
										membersController={membersController}
										membersPageIndex={membersPageIndex}
										setMembersPageIndex={members.setMembersPageIndex}
										onOpenAssignDrawer={() => setAssignDrawerOpen(true)}
									/>

									<AssignMembersDrawer
										key={`assign-${tenantId}:${roleId}`}
										tenantId={tenantId}
										roleId={roleId}
										isOpen={isAssignDrawerOpen}
										onOpenChange={setAssignDrawerOpen}
										onSessionExpired={() => setShouldRedirectToLogout(true)}
									/>
								</TenantDetailsPageShell>
							);
						}}
					</QueryDisplay>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/roles/$roleId/users',
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
			{
				kind: 'label',
				labelKey: 'common:roles',
				to: `/staff/tenants/${params.tenantId}/roles`,
			},
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}/roles/${params.roleId}`,
				query: staffTenantRoleCrumbQuery,
				select: selectStaffTenantRoleCrumbName,
			},
			{ kind: 'label', labelKey: 'common:members' },
		],
	},
	validateSearch: (search) =>
		parseRoleMembersSearchParams(search as RoleMembersSearchParamInput),
	component: StaffTenantRoleMembersPage,
});
