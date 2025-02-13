/* eslint-disable import/no-extraneous-dependencies */
import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@devist/shared/lib/constants';
import { getLastPath } from '@devist/shared/utils/string.utils';

const routes = [
	layout('routes/marketing/MarketingPagesLayout.tsx', [
		// ==
		index('routes/marketing/HomePage.tsx'),
	]),
	layout('routes/auth/AuthPagesLayout.tsx', [
		// ==
		route(getLastPath(FRONT_PATH_NAMES.auth.login), 'routes/auth/login/LoginPage.tsx'),
	]),
	layout('routes/authed/AuthedPagesLayout.tsx', [
		// ==
		route(getLastPath(FRONT_PATH_NAMES.staff.root), 'routes/authed/admin/AdminPagesLayout.tsx', [
			index('routes/authed/admin/dashboard/AdminDashboardPage.tsx'),
			// route('settings', 'routes/authed/admin/settings/SettingsPage.tsx'),
		]),
		route(getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').root, 2), 'routes/authed/client/TenantPagesLayout.tsx', [
			index('routes/authed/client/dashboard/TenantDashboardPage.tsx'),
			// // route('settings', 'routes/authed/admin/settings/SettingsPage.tsx'),
		]),
		route('*', 'routes/authed/errors/AuthedNotFoundPage.tsx'),
	]),
] satisfies RouteConfig;

export default routes;
