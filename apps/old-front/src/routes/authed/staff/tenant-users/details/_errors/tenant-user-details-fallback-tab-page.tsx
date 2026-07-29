import { redirect } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/tenant-user-details-fallback-tab-page';

export const clientLoader = ({ params, url }: Route.ClientLoaderArgs) => {
	const nextUrl = new URL(url);
	nextUrl.pathname = FRONT_PATH_NAMES.staff.tenantUsers.details(
		params.userId,
	).tabs.general;

	return redirect(nextUrl.toString());
};

const TenantUserDetailsFallbackTabPage = () => {
	return null;
};

export default TenantUserDetailsFallbackTabPage;
