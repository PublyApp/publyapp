import {
	index,
	layout,
	route,
	type RouteConfig,
} from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

const routes = [
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		// ====
		index('routes/marketing/home/home-page.tsx'),
	]),
	layout('routes/auth/_layout/auth-layout.tsx', [
		route(
			getLastPath(FRONT_PATH_NAMES.auth.login),
			'routes/auth/login/login-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.signup),
			'routes/auth/signup/SignUpPage.tsx',
		),
	]),
	layout('routes/authed/_layout/authed-layout.tsx', [
		route(
			getLastPath(FRONT_PATH_NAMES.staff.root),
			'routes/authed/staff/_layout/staff-layout.tsx',
			[
				layout('routes/authed/staff/_layout/page-layout.tsx', [
					index('routes/authed/staff/dashboard/staff-home-page.tsx'),
					route(
						getLastPath(FRONT_PATH_NAMES.staff.tenants.root),
						'routes/authed/staff/tenants-list/tenants-list-page.tsx',
					),
					route(
						getLastPath(FRONT_PATH_NAMES.staff.staffMembers.root),
						'routes/authed/staff/staff-members/staff-members-page.tsx',
					),
				]),
				route('*', 'routes/authed/staff/_errors/staff-not-found-page.tsx'),
			],
		),
		route(
			getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').root, 2),
			'routes/authed/tenant/_layout/tenant-layout.tsx',
			[
				index('routes/authed/tenant/dashboard/tenant-home-page.tsx'),
				route('*', 'routes/authed/tenant/_errors/tenant-not-found-page.tsx'),
			],
		),
	]),
] satisfies RouteConfig;

export default routes;
