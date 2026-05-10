import { index, prefix, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

export const staffTenantUsersRoutes = [
	...prefix(getLastPath(FRONT_PATH_NAMES.staff.tenantUsers.root), [
		route(
			// `2` matches the two trailing segments of the URL pattern
			// `details/:userId` — the route is mounted under the
			// `staff/tenant-users` prefix above, so we only feed React Router
			// the `details/:userId` portion.
			//
			// If the URL helper changes (e.g., adding/removing path segments
			// from `tenantUsers.details(...)`), this count must change too.
			// Mirror the pattern used by staff-tenants.routes.ts.
			getLastPath(
				FRONT_PATH_NAMES.staff.tenantUsers.details(':userId').root,
				2,
			),
			'routes/authed/staff/tenant-users/details/_layout/tenant-user-details-layout.tsx',
			[
				// Keep /staff/tenant-users/details/:userId bookmarkable while making each
				// visible details tab own its own route.
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
