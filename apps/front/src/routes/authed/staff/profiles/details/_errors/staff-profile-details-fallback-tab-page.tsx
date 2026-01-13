import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { redirect } from 'react-router';
import type { Route } from './+types/staff-profile-details-fallback-tab-page';

export const clientLoader = (args: Route.ClientLoaderArgs) => {
	const url = new URL(args.request.url);
	url.pathname = FRONT_PATH_NAMES.staff.profiles.details(
		args.params.profileId,
	).tabs.basicsAndPermissions;

	return redirect(url.toString());
};

const StaffProfileDetailsFallbackTabPage = () => {
	return null;
};

export default StaffProfileDetailsFallbackTabPage;
