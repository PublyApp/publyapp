import { index, prefix, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

export const staffTenantsRoutes = [
	...prefix(getLastPath(FRONT_PATH_NAMES.staff.tenants.root), [
		index('routes/authed/staff/tenants/list/tenants-list-page.tsx'),
		route(
			getLastPath(FRONT_PATH_NAMES.staff.tenants.new),
			'routes/authed/staff/tenants/new/new-tenant-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.staff.tenants.details(':tenantId').root, 2),
			'routes/authed/staff/tenants/details/_layout/tenant-details-layout.tsx',
			[
				index(
					'routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx',
				),
				route(
					getLastPath(
						FRONT_PATH_NAMES.staff.tenants.details(':tenantId').tabs.users,
					),
					'routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx',
				),
				route(
					getLastPath(
						FRONT_PATH_NAMES.staff.tenants.details(':tenantId').tabs
							.invitations,
					),
					'routes/authed/staff/tenants/details/invitations/tenant-details-invitations-page.tsx',
				),
				route(
					getLastPath(
						FRONT_PATH_NAMES.staff.tenants.details(':tenantId').tabs.billing,
					),
					'routes/authed/staff/tenants/details/billing/tenant-details-billing-page.tsx',
				),
				route(
					getLastPath(
						FRONT_PATH_NAMES.staff.tenants.details(':tenantId').tabs.profiles,
					),
					'routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx',
				),
				route(
					'*',
					'routes/authed/staff/tenants/details/_errors/tenant-details-fallback-tab-page.tsx',
				),
			],
		),
	]),
];
