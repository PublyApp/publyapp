import { redirect } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/staff-profile-details-fallback-tab-page';

export const clientLoader = ({ params, url }: Route.ClientLoaderArgs) => {
	const nextUrl = new URL(url);
	nextUrl.pathname = FRONT_PATH_NAMES.staff.profiles.details(
		params.profileId,
	).tabs.basicsAndPermissions;

	return redirect(nextUrl.toString());
};

const StaffProfileDetailsFallbackTabPage = () => {
	return null;
};

export default StaffProfileDetailsFallbackTabPage;
