/* eslint-disable import/no-extraneous-dependencies */
import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

const routes = [
	layout('routes/marketing/MarketingPagesLayout.tsx', [
		// ==
		index('routes/marketing/HomePage.tsx'),
	]),
	layout('routes/auth/AuthPagesLayout.tsx', [
		// ==
		route('login', 'routes/auth/login/LoginPage.tsx'),
	]),
	layout('routes/authed/AuthedPagesLayout.tsx', [
		// ==
		// route('staff', 'routes/authed/admin/DashboardPage.tsx'),
		route('staff', 'routes/authed/admin/AdminDashboardPagesLayout.tsx', [
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
