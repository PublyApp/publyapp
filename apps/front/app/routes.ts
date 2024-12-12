/* eslint-disable import/no-extraneous-dependencies */
import { index, layout, type RouteConfig } from '@react-router/dev/routes';

export default [
	layout('routes/marketing/MarketingPagesLayout.tsx', [
		// = =
		index('routes/marketing/HomePage.tsx'),
	]),
] satisfies RouteConfig;
