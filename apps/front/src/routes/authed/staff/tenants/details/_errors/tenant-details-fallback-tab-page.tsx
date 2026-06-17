import { redirect } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/tenant-details-fallback-tab-page';

export const clientLoader = ({ params, url }: Route.ClientLoaderArgs) => {
	const nextUrl = new URL(url);
	nextUrl.pathname = FRONT_PATH_NAMES.staff.tenants.details(
		params.tenantId,
	).tabs.general;

	return redirect(nextUrl.toString());
};

const TenantDetailsFallbackTabPage = () => {
	return null;
};

export default TenantDetailsFallbackTabPage;
