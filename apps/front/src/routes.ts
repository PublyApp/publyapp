import { layout, type RouteConfig, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

import { actionsRoutes } from './routes/_tree/actions.routes';
import { authRoutes } from './routes/_tree/auth.routes';
import { marketingRoutes } from './routes/_tree/marketing.routes';
import { staffRoutes } from './routes/_tree/staff/staff.routes';
import { tenantRoutes } from './routes/_tree/tenant/tenant.routes';

const coreRoutes = [
	route(
		getLastPath(FRONT_PATH_NAMES.unauthorized),
		'routes/unauthorized/unauthorized-page.tsx',
	),
];

const authedRoutes = [
	layout('routes/authed/_layout/authed-layout.tsx', [
		...staffRoutes,
		...tenantRoutes,
	]),
];

const routes = [
	...coreRoutes,
	...actionsRoutes,
	...marketingRoutes,
	...authRoutes,
	...authedRoutes,
] satisfies RouteConfig;

export default routes;
