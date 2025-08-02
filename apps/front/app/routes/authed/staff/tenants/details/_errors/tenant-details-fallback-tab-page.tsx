import { redirect } from 'react-router';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import type { Route } from './+types/tenant-details-fallback-tab-page';

export const clientLoader = (args: Route.ClientLoaderArgs) => {
	return redirect(
		FRONT_PATH_NAMES.staff.tenants.details(args.params.tenantId).tabs.general,
	);
};

const TenantDetailsFallbackTabPage = () => {
	return null;
};

export default TenantDetailsFallbackTabPage;
