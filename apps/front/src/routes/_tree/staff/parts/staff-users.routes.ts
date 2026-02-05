import { index, prefix, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

export const staffUsersRoutes = [
	...prefix(getLastPath(FRONT_PATH_NAMES.staff.staffUsers.root), [
		index('routes/authed/staff/staff-users/list/staff-users-list-page.tsx'),
		route(
			getLastPath(FRONT_PATH_NAMES.staff.staffUsers.new),
			'routes/authed/staff/staff-users/new/new-staff-user-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.staff.staffUsers.details(':userId'), 2),
			'routes/authed/staff/staff-users/details/staff-user-details-page.tsx',
		),
	]),
];
