/* eslint-disable import/no-extraneous-dependencies */
import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

const routes = [
	layout('routes/marketing/MarketingLayout.tsx', [
		// ====
		index('routes/marketing/home/HomePage.tsx'),
	]),
	layout('routes/auth/AuthPagesLayout.tsx', [
		route(getLastPath(FRONT_PATH_NAMES.auth.login), 'routes/auth/login/LoginPage.tsx'),
	]),
	layout('routes/authed/AuthedPagesLayout.tsx', [
		route(getLastPath(FRONT_PATH_NAMES.staff.root), 'routes/authed/staff/StaffLayout.tsx', [
			index('routes/authed/staff/dashboard/StaffHomePage.tsx'),
			route(getLastPath(FRONT_PATH_NAMES.staff.tenants.root), 'routes/authed/staff/tenants-list/TenantsListPage.tsx'),
		]),
		route(getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').root, 2), 'routes/authed/tenant/TenantLayout.tsx', [
			index('routes/authed/tenant/dashboard/TenantHomePage.tsx'),
		]),
		route('*', 'routes/authed/errors/AuthedNotFoundPage.tsx'),
	]),
] satisfies RouteConfig;

export default routes;
