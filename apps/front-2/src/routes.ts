import { index, layout, rootRoute, route } from '@tanstack/virtual-file-routes';

export const routes = rootRoute('__root.tsx', [
	index('index.tsx'),
	route('/login', 'login.tsx'),
	layout('authed-layout', 'authed/layout.tsx', [
		route('/staff', 'authed/staff.tsx'),
		route('/staff/staff-users', 'authed/staff/staff-users.tsx'),
		route('/tenant', 'authed/tenant.tsx'),
	]),
]);
