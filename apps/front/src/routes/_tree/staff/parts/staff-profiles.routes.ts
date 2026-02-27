import { index, prefix, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

export const staffProfilesRoutes = [
	...prefix(getLastPath(FRONT_PATH_NAMES.staff.profiles.root), [
		index('routes/authed/staff/profiles/list/staff-profiles-list-page.tsx'),
		route(
			getLastPath(FRONT_PATH_NAMES.staff.profiles.new),
			'routes/authed/staff/profiles/new/new-staff-profile-page.tsx',
		),
		route(
			getLastPath(
				FRONT_PATH_NAMES.staff.profiles.details(':profileId').root,
				2,
			),
			'routes/authed/staff/profiles/details/_layout/staff-profile-details-layout.tsx',
			[
				index(
					'routes/authed/staff/profiles/details/basics/staff-profile-details-basics-tab-page.tsx',
				),
				route(
					getLastPath(
						FRONT_PATH_NAMES.staff.profiles.details(':profileId').tabs.users,
					),
					'routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx',
				),
				route(
					'*',
					'routes/authed/staff/profiles/details/_errors/staff-profile-details-fallback-tab-page.tsx',
				),
			],
		),
	]),
];
