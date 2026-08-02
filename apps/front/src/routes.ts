import { index, layout, rootRoute, route } from '@tanstack/virtual-file-routes';

export const routes = rootRoute('__root.tsx', [
	index('index.tsx'),
	route('/login', 'login.tsx'),
	route('/signup', 'signup.tsx'),
	route('/health', 'health.tsx'),
	route('/verify-email', 'verify-email.tsx'),
	route('/reset-password', 'reset-password.tsx'),
	route('/accept-invitation', 'accept-invitation.tsx'),
	route('/field-validation', 'field-validation.tsx'),
	route('/temp/landing-05', 'temp/landing-05.tsx'),
	route('/temp/landing-06', 'temp/landing-06.tsx'),
	route('/temp/landing-07', 'temp/landing-07.tsx'),
	route('/temp/landing-08', 'temp/landing-08.tsx'),
	layout('authed-layout', 'authed/layout.tsx', [
		route('/staff', 'authed/staff.tsx'),
		route('/staff/dashboard', 'authed/staff/dashboard.tsx', [
			index('authed/staff/dashboard/index.tsx'),
			route('/activity', 'authed/staff/dashboard/activity.tsx'),
			route('/reports', 'authed/staff/dashboard/reports.tsx'),
		]),
		route('/staff/staff-users', 'authed/staff/staff-users.tsx'),
		route(
			'/staff/staff-users/$userId',
			'authed/staff/staff-users/$userId.tsx',
			[
				index('authed/staff/staff-users/$userId/index.tsx'),
				route(
					'/permissions',
					'authed/staff/staff-users/$userId/permissions.tsx',
				),
				route('/activity', 'authed/staff/staff-users/$userId/activity.tsx'),
				route('/settings', 'authed/staff/staff-users/$userId/settings.tsx'),
			],
		),
		route(
			'/staff/staff-users/$userId/edit',
			'authed/staff/staff-users/$userId-edit.tsx',
		),
		route('/staff/tenants', 'authed/staff/tenants.tsx'),
		route('/staff/tenants/new', 'authed/staff/tenants-new.tsx'),
		route('/staff/tenants/$tenantId', 'authed/staff/tenants/$tenantId.tsx'),
		route(
			'/staff/tenants/$tenantId/edit',
			'authed/staff/tenants/$tenantId-edit.tsx',
		),
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
			'/staff/tenants/$tenantId/users/$userId/edit',
			'authed/staff/tenants/$tenantId/users/$userId-edit.tsx',
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
			[
				index('authed/staff/tenants/$tenantId/profiles/$profileId/index.tsx'),
				route(
					'/permissions',
					'authed/staff/tenants/$tenantId/profiles/$profileId/permissions.tsx',
				),
				route(
					'/members',
					'authed/staff/tenants/$tenantId/profiles/$profileId/members.tsx',
				),
			],
		),
		route(
			'/staff/tenants/$tenantId/profiles/$profileId/edit',
			'authed/staff/tenants/$tenantId/profiles/$profileId-edit.tsx',
		),
		route(
			'/staff/tenants/$tenantId/profiles/$profileId/users',
			'authed/staff/tenants/$tenantId/profiles/$profileId/users.tsx',
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
