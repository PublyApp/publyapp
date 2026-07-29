import { layout, type RouteConfig } from '@react-router/dev/routes';

import { actionsRoutes } from './routes/_tree/actions.routes';
import { authRoutes } from './routes/_tree/auth.routes';
import { marketingRoutes } from './routes/_tree/marketing.routes';
import { staffRoutes } from './routes/_tree/staff/staff.routes';
import { tenantRoutes } from './routes/_tree/tenant/tenant.routes';

const authedRoutes = [
	layout('routes/authed/_layout/authed-layout.tsx', [
		...staffRoutes,
		...tenantRoutes,
	]),
];

const routes = [
	...actionsRoutes,
	...marketingRoutes,
	...authRoutes,
	...authedRoutes,
] satisfies RouteConfig;

export default routes;
