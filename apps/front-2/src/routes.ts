import { index, layout, rootRoute, route } from '@tanstack/virtual-file-routes';

export const routes = rootRoute('__root.tsx', [
	index('index.tsx'),
	route('/login', 'login.tsx'),
	route('/field-validation', 'field-validation.tsx'),
	layout('authed-layout', 'authed/layout.tsx', [
		route('/staff', 'authed/staff.tsx'),
		route('/staff/staff-users', 'authed/staff/staff-users.tsx'),
		route('/staff/staff-users/$userId', 'authed/staff/staff-users/$userId.tsx'),
		route('/staff/tenants', 'authed/staff/tenants.tsx'),
		route('/staff/tenants/$tenantId', 'authed/staff/tenants/$tenantId.tsx'),
		route(
			'/staff/tenants/$tenantId/users/invite',
			'authed/staff/tenants/$tenantId/users-invite.tsx',
		),
		route(
			'/staff/tenants/$tenantId/users/$userId',
			'authed/staff/tenants/$tenantId/users/$userId.tsx',
		),
		route(
			'/staff/tenants/$tenantId/users',
			'authed/staff/tenants/$tenantId/users.tsx',
		),
		route(
			'/staff/tenants/$tenantId/invitations',
			'authed/staff/tenants/$tenantId/invitations.tsx',
		),
		route(
			'/staff/tenants/$tenantId/profiles',
			'authed/staff/tenants/$tenantId/profiles.tsx',
		),
		route(
			'/staff/tenants/$tenantId/profiles/new',
			'authed/staff/tenants/$tenantId/profiles-new.tsx',
		),
		route(
			'/staff/tenants/$tenantId/profiles/$profileId',
			'authed/staff/tenants/$tenantId/profiles/$profileId.tsx',
		),
		route(
			'/staff/tenants/$tenantId/profiles/$profileId/edit',
			'authed/staff/tenants/$tenantId/profiles/$profileId-edit.tsx',
		),
		route('/staff/profiles', 'authed/staff/profiles.tsx'),
		route('/staff/profiles/new', 'authed/staff/profiles-new.tsx'),
		route('/staff/profiles/$profileId', 'authed/staff/profiles/$profileId.tsx'),
		route(
			'/staff/profiles/$profileId/users',
			'authed/staff/profiles/$profileId/users.tsx',
		),
		route('/staff/invitations', 'authed/staff/invitations/index.tsx'),
		route('/staff/invitations/new', 'authed/staff/invitations/new.tsx'),
		route(
			'/staff/invitations/$invitationId',
			'authed/staff/invitations/$invitationId.tsx',
		),
		route('/tenant', 'authed/tenant.tsx'),
	]),
]);
