import { createFileRoute } from '@tanstack/react-router';

import { ProfileMembersTab } from '../_profile-members-tab';
import { staffTenantProfileCrumbsBase } from './_crumbs';
import { useStaffTenantProfileDetailsContext } from './_details-context';

const StaffTenantProfileMembersSection = () => {
	const { tenantId, profileId, profile, onSessionExpired } =
		useStaffTenantProfileDetailsContext();

	return (
		<ProfileMembersTab
			tenantId={tenantId}
			profileId={profileId}
			memberCount={profile.userAccountCount}
			onSessionExpired={onSessionExpired}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId/members',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-profiles'],
		crumbs: (params) => [
			...staffTenantProfileCrumbsBase(params),
			{ kind: 'label', labelKey: 'common:members' },
		],
	},
	component: StaffTenantProfileMembersSection,
});
