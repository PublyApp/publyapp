import { index, layout, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

import { staffAuditLogsRoutes } from './_parts/staff-audit-logs.routes';
import { staffInvitationsRoutes } from './_parts/staff-invitations.routes';
import { staffProfilesRoutes } from './_parts/staff-profiles.routes';
import { staffTenantUsersRoutes } from './_parts/staff-tenant-users.routes';
import { staffTenantsRoutes } from './_parts/staff-tenants.routes';
import { staffUsersRoutes } from './_parts/staff-users.routes';

export const staffRoutes = [
	route(
		getLastPath(FRONT_PATH_NAMES.staff.root),
		'routes/authed/staff/_layout/staff-layout.tsx',
		[
			layout('routes/authed/staff/_layout/page-layout.tsx', [
				index('routes/authed/staff/dashboard/staff-home-page.tsx'),
				...staffTenantsRoutes,
				...staffTenantUsersRoutes,
				...staffUsersRoutes,
				...staffInvitationsRoutes,
				...staffProfilesRoutes,
				...staffAuditLogsRoutes,
			]),
			route('*', 'routes/authed/staff/_errors/staff-not-found-page.tsx'),
		],
	),
];
