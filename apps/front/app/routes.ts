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
		// route('staff', 'routes/authed/admin/DashboardPage.tsx'),
		route(getLastPath(FRONT_PATH_NAMES.staff.root), 'routes/authed/admin/AdminDashboardPagesLayout.tsx', [
			index('routes/authed/admin/dashboard/AdminDashBoardPage.tsx'),
			// route('settings', 'routes/authed/admin/settings/SettingsPage.tsx'),
		]),
		// route('@\::tenantId', 'routes/authed/client/TenantDashboardPagesLayout.tsx', [
		// 	// index('routes/authed/admin/dashboard/AdminDashBoardPage.tsx'),
		// 	// // route('settings', 'routes/authed/admin/settings/SettingsPage.tsx'),
		// ]),
	]),
] satisfies RouteConfig;

export default routes;
