import { index, layout, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

import { staffAuditLogsRoutes } from './parts/staff-audit-logs.routes';
import { staffInvitationsRoutes } from './parts/staff-invitations.routes';
import { staffProfilesRoutes } from './parts/staff-profiles.routes';
import { staffTenantsRoutes } from './parts/staff-tenants.routes';
import { staffUsersRoutes } from './parts/staff-users.routes';

export const staffRoutes = [
	route(
		getLastPath(FRONT_PATH_NAMES.staff.root),
		'routes/authed/staff/_layout/staff-layout.tsx',
		[
			layout('routes/authed/staff/_layout/page-layout.tsx', [
				index('routes/authed/staff/dashboard/staff-home-page.tsx'),
				...staffTenantsRoutes,
				...staffUsersRoutes,
				...staffInvitationsRoutes,
				...staffProfilesRoutes,
				...staffAuditLogsRoutes,
			]),
			route('*', 'routes/authed/staff/_errors/staff-not-found-page.tsx'),
		],
	),
];
