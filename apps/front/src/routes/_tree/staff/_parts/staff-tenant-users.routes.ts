import { index, prefix, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

export const staffTenantUsersRoutes = [
	...prefix(getLastPath(FRONT_PATH_NAMES.staff.tenantUsers.root), [
		route(
			getLastPath(
				FRONT_PATH_NAMES.staff.tenantUsers.details(':userId').root,
				1,
			),
			'routes/authed/staff/tenant-users/details/_layout/tenant-user-details-layout.tsx',
			[
				index(
					'routes/authed/staff/tenant-users/details/_redirects/tenant-user-details-index-redirect-page.tsx',
				),
				route(
					getLastPath(
						FRONT_PATH_NAMES.staff.tenantUsers.details(':userId').tabs.general,
					),
					'routes/authed/staff/tenant-users/details/general/tenant-user-details-general-page.tsx',
				),
				route(
					getLastPath(
						FRONT_PATH_NAMES.staff.tenantUsers.details(':userId').tabs
							.organizations,
					),
					'routes/authed/staff/tenant-users/details/organizations/tenant-user-details-organizations-page.tsx',
				),
				route(
					'*',
					'routes/authed/staff/tenant-users/details/_errors/tenant-user-details-fallback-tab-page.tsx',
				),
			],
		),
	]),
];
