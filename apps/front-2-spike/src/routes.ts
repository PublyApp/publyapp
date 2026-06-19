import { index, layout, rootRoute, route } from '@tanstack/virtual-file-routes';

// Code-based Virtual File Routes tree (the routing source of truth for the spike).
// The route FILES live under src/routes/* but their nesting/URLs are declared here,
// not inferred from the filesystem — see routeTree.gen.ts (generated from this).
//
// IMPORTANT (resolved in Task 1.4): VFR file paths are joined to the
// `routesDirectory` (src/routes), NOT to `src`. So paths are relative to src/routes
// — e.g. '__root.tsx', NOT 'routes/__root.tsx'. (The plan's 'routes/…' prefix was
// for this version a bug that produced src/routes/routes/__root.tsx.)
export const routes = rootRoute('__root.tsx', [
	index('index.tsx'),
	route('/login', 'login.tsx'),
	layout('authed-layout', 'authed/layout.tsx', [
		route('/staff/staff-users', 'authed/staff-users.tsx'),
		route('/_auth-echo', 'authed/auth-echo.tsx'),
	]),
]);
