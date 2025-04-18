/* eslint-disable import/no-extraneous-dependencies */
import {
	index,
	layout,
	route,
	type RouteConfig,
} from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

const routes = [
	layout('routes/marketing/_layout/MarketingLayout.tsx', [
		// ====
		index('routes/marketing/home/HomePage.tsx'),
	]),
	layout('routes/auth/_layout/AuthLayout.tsx', [
		route(
			getLastPath(FRONT_PATH_NAMES.auth.login),
			'routes/auth/login/LoginPage.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.signup),
			'routes/auth/signup/SignUpPage.tsx',
		),
	]),
	layout('routes/authed/_layout/AuthedLayout.tsx', [
		route(
			getLastPath(FRONT_PATH_NAMES.staff.root),
			'routes/authed/staff/_layout/StaffLayout.tsx',
			[
				index('routes/authed/staff/dashboard/StaffHomePage.tsx'),
				route(
					getLastPath(FRONT_PATH_NAMES.staff.tenants.root),
					'routes/authed/staff/tenants-list/TenantsListPage.tsx',
				),
				route('*', 'routes/authed/staff/_errors/StaffNotFoundPage.tsx'),
			],
		),
		route(
			getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').root, 2),
			'routes/authed/tenant/_layout/TenantLayout.tsx',
			[
				index('routes/authed/tenant/dashboard/TenantHomePage.tsx'),
				route('*', 'routes/authed/tenant/_errors/TenantNotFoundPage.tsx'),
			],
		),
	]),
] satisfies RouteConfig;

export default routes;
