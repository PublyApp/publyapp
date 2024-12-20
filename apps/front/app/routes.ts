/* eslint-disable import/no-extraneous-dependencies */
import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

const withLangWrapper = (routes: RouteConfig) => {
	return [route(':lang?', 'routes/_lang/lang.tsx', routes as never)];
};

const routes = [
	layout('routes/marketing/MarketingPagesLayout.tsx', [
		// = =
		index('routes/marketing/HomePage.tsx'),
	]),
	layout('routes/auth/AuthPagesLayout.tsx', [route('login', 'routes/auth/login/LoginPage.tsx')]),
] satisfies RouteConfig;

console.dir(routes, { depth: null });

export default withLangWrapper(routes);
