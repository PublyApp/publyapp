import { route, type RouteConfigEntry } from '@react-router/dev/routes';

// Dev-only routes. `import.meta.env.DEV` is statically replaced by Vite at
// build time, so the production bundle gets `false` and the sandbox route +
// page module are tree-shaken away. Never ships to prod.

export const devRoutes: RouteConfigEntry[] = import.meta.env.DEV
	? [
			route(
				'dev/sandbox/error-views',
				'routes/_dev/sandbox/error-views/error-views-sandbox-page.tsx',
			),
		]
	: [];
