import { redirect } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/tenant-details-fallback-tab-page';

export const clientLoader = (args: Route.ClientLoaderArgs) => {
	const url = new URL(args.request.url);
	url.pathname = FRONT_PATH_NAMES.staff.tenants.details(
		args.params.tenantId,
	).tabs.general;

	return redirect(url.toString());
};

const TenantDetailsFallbackTabPage = () => {
	return null;
};

export default TenantDetailsFallbackTabPage;
