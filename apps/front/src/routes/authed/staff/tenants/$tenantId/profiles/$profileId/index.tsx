import { createFileRoute, redirect } from '@tanstack/react-router';

import {
	parseProfileOverviewSearchParams,
	type ProfileOverviewSearchParamInput,
} from '../_profile-details-search';
import { ProfileOverviewTab } from '../_profile-overview-tab';
import { staffTenantProfileCrumbsBase } from './_crumbs';
import { useStaffTenantProfileDetailsContext } from './_details-context';

const StaffTenantProfileOverviewSection = () => {
	const {
		tenantId,
		profile,
		permissionKeys,
		permissionGroups,
		isCatalogPending,
		isCatalogError,
		members,
		membersPending,
		membersError,
		locale,
		onDeleteRequest,
		isDeletePending,
	} = useStaffTenantProfileDetailsContext();

	return (
		<ProfileOverviewTab
			tenantId={tenantId}
			profile={profile}
			permissionKeys={permissionKeys}
			permissionGroups={permissionGroups}
			isCatalogPending={isCatalogPending}
			isCatalogError={isCatalogError}
			members={members}
			membersPending={membersPending}
			membersError={membersError}
			locale={locale}
			onDeleteRequest={onDeleteRequest}
			isDeletePending={isDeletePending}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId/',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-profiles'],
		crumbs: staffTenantProfileCrumbsBase,
	},
	validateSearch: (search) =>
		parseProfileOverviewSearchParams(search as ProfileOverviewSearchParamInput),
	// Legacy `?tab=` links are in the wild (bookmarks, pasted URLs). Silently
	// ignoring one would land the visitor on Overview and read as data loss,
	// so send them to the section they asked for and drop the param — the
	// redirect's `search` object REPLACES the search, which is what removes
	// `tab` from the address bar. `replace: true` keeps the legacy entry out
	// of the history stack, so a Back from the section does not bounce
	// straight back through this redirect.
	beforeLoad: ({ params, search }) => {
		if (!search.tab) {
			return;
		}

		throw redirect({
			to:
				search.tab === 'permissions'
					? '/staff/tenants/$tenantId/profiles/$profileId/permissions'
					: '/staff/tenants/$tenantId/profiles/$profileId/members',
			params: { tenantId: params.tenantId, profileId: params.profileId },
			search: { edit: search.edit },
			replace: true,
		});
	},
	component: StaffTenantProfileOverviewSection,
});
