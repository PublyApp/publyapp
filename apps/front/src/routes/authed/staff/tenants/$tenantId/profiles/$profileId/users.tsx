import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import {
	selectStaffTenantProfileCrumbName,
	staffTenantProfileCrumbQuery,
	toStaffTenantProfileDetails,
} from '~/lib/query/staff-tenant-profiles';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../../_tenant-details-shell';
import { AssignMembersDrawer } from './_assign-members-drawer';
import {
	ProfileMembersLoading,
	ProfileMissingSlot,
	TenantMissingSlot,
	TenantProfileMembersError,
} from './_members-error-views';
import {
	parseProfileMembersSearchParams,
	serializeProfileMembersSearchParams,
	type ProfileMembersSearchParamInput,
	type ProfileMembersSearchParams,
} from './_profile-members-search';
import { ProfileMembersView } from './_profile-members-view';
import { useStaffTenantProfileMembers } from './_use-profile-members-state';

export { makeProfileMemberColumns } from '../_profile-member-columns';
export {
	parseProfileMembersSearchParams,
	serializeProfileMembersSearchParams,
	type ProfileMembersSearchParamInput,
} from './_profile-members-search';

const StaffTenantProfileMembersPage = () => {
	const { tenantId, profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation(['common', 'staff-tenant-profiles']);

	// Both URL writers wrap `Route.useNavigate()` in `useCallback` and are
	// invoked exclusively from event handlers downstream — never during
	// render (`react-doctor/navigate-in-render`).
	const setAssignDrawerOpen = useCallback(
		(isOpen: boolean): void => {
			void navigate({
				search: (previous: ProfileMembersSearchParams) =>
					serializeProfileMembersSearchParams({
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
				search: serializeProfileMembersSearchParams({
					...next,
					assign: search.assign,
				}),
				replace: true,
			});
		},
		[navigate, search.assign],
	);

	const members = useStaffTenantProfileMembers({
		tenantId,
		profileId,
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
	const profile = toStaffTenantProfileDetails(detailQuery.data);

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
						LoadingSlot={<ProfileMembersLoading />}
						ErrorSlot={({ error }) => (
							<TenantProfileMembersError
								error={error}
								onRetry={() => void detailQuery.refetch()}
							/>
						)}
						EmptySlot={<ProfileMissingSlot />}
					>
						{() => {
							if (!profile) {
								return <ProfileMissingSlot />;
							}

							return (
								<TenantDetailsPageShell
									tenant={tenant}
									activeSection="profiles"
									testId="staff-tenant-profile-members-page"
									bodyScroll="contained"
								>
									<ProfileMembersView
										tenantId={tenantId}
										profileId={profileId}
										t={t}
										profile={profile}
										memberColumns={memberColumns}
										memberRows={memberRows}
										membersQuery={membersQuery}
										membersController={membersController}
										membersPageIndex={membersPageIndex}
										setMembersPageIndex={members.setMembersPageIndex}
										onOpenAssignDrawer={() => setAssignDrawerOpen(true)}
									/>

									<AssignMembersDrawer
										key={`assign-${tenantId}:${profileId}`}
										tenantId={tenantId}
										profileId={profileId}
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
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId/users',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-profiles'],
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
				labelKey: 'common:profiles',
				to: `/staff/tenants/${params.tenantId}/profiles`,
			},
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}/profiles/${params.profileId}`,
				query: staffTenantProfileCrumbQuery,
				select: selectStaffTenantProfileCrumbName,
			},
			{ kind: 'label', labelKey: 'common:members' },
		],
	},
	validateSearch: (search) =>
		parseProfileMembersSearchParams(search as ProfileMembersSearchParamInput),
	component: StaffTenantProfileMembersPage,
});
