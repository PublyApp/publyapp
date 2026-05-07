import { prefix, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

export const staffTenantUsersRoutes = [
	...prefix(getLastPath(FRONT_PATH_NAMES.staff.tenantUsers.root), [
		route(
			getLastPath(FRONT_PATH_NAMES.staff.tenantUsers.details(':userId'), 1),
			'routes/authed/staff/tenant-users/details/tenant-user-details-page.tsx',
		),
	]),
];
