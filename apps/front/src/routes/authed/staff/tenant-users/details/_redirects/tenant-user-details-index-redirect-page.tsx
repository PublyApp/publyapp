import { redirect } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import type { Route } from './+types/tenant-user-details-index-redirect-page';

export const clientLoader = (args: Route.ClientLoaderArgs) => {
	const url = new URL(args.request.url);
	url.pathname = FRONT_PATH_NAMES.staff.tenantUsers.details(
		args.params.userId,
	).tabs.general;

	return redirect(url.toString());
};

const TenantUserDetailsIndexRedirectPage = () => {
	return null;
};

export default TenantUserDetailsIndexRedirectPage;
