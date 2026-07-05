import { index, layout, rootRoute, route } from '@tanstack/virtual-file-routes';

export const routes = rootRoute('__root.tsx', [
	index('index.tsx'),
	route('/login', 'login.tsx'),
	route('/field-validation', 'field-validation.tsx'),
	layout('authed-layout', 'authed/layout.tsx', [
		route('/staff', 'authed/staff.tsx'),
		route('/staff/staff-users', 'authed/staff/staff-users.tsx'),
		route('/staff/invitations', 'authed/staff/invitations/index.tsx'),
		route('/staff/invitations/new', 'authed/staff/invitations/new.tsx'),
		route('/tenant', 'authed/tenant.tsx'),
	]),
]);
