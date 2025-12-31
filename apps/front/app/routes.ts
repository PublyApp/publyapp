import {
	index,
	layout,
	prefix,
	type RouteConfig,
	route,
} from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

const routes = [
	// Standalone routes (no layout)
	route(
		getLastPath(FRONT_PATH_NAMES.maintenance),
		'routes/maintenance/maintenance-page.tsx',
	),
	// Action-only route for clearing httpOnly session cookies (POST + Origin/Fetch-metadata validation)
	route(
		getLastPath(FRONT_PATH_NAMES.auth.clearSession, 2),
		'routes/auth/clear-session.tsx',
	),
	// Marketing routes
	layout('routes/marketing/_layout/marketing-layout.tsx', [
		index('routes/marketing/home/home-page.tsx'),
	]),
	layout('routes/auth/_layout/auth-layout.tsx', [
		route(
			getLastPath(FRONT_PATH_NAMES.auth.login),
			'routes/auth/login/login-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.signup),
			'routes/auth/signup/sign-up-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.verifyEmail),
			'routes/auth/verify-email/verify-email-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.resetPassword),
			'routes/auth/reset-password/reset-password-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.auth.acceptInvitation),
			'routes/auth/accept-invitation/accept-invitation-page.tsx',
		),
	]),
	layout('routes/authed/_layout/authed-layout.tsx', [
		route(
			getLastPath(FRONT_PATH_NAMES.onboarding.root),
			'routes/authed/onboarding/onboarding-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.staff.root),
			'routes/authed/staff/_layout/staff-layout.tsx',
			[
				layout('routes/authed/staff/_layout/page-layout.tsx', [
					index('routes/authed/staff/dashboard/staff-home-page.tsx'),
					...prefix(getLastPath(FRONT_PATH_NAMES.staff.tenants.root), [
						index('routes/authed/staff/tenants/list/tenants-list-page.tsx'),
						route(
							getLastPath(FRONT_PATH_NAMES.staff.tenants.new),
							'routes/authed/staff/tenants/new/new-tenant-page.tsx',
						),
						route(
							getLastPath(
								FRONT_PATH_NAMES.staff.tenants.details(':tenantId').root,
								2,
							),
							'routes/authed/staff/tenants/details/_layout/tenant-details-layout.tsx',
							[
								index(
									'routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx',
								),
								route(
									getLastPath(
										FRONT_PATH_NAMES.staff.tenants.details(':tenantId').tabs
											.users,
									),
									'routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx',
								),
								route(
									getLastPath(
										FRONT_PATH_NAMES.staff.tenants.details(':tenantId').tabs
											.billing,
									),
									'routes/authed/staff/tenants/details/billing/tenant-details-billing-page.tsx',
								),
								route(
									getLastPath(
										FRONT_PATH_NAMES.staff.tenants.details(':tenantId').tabs
											.profiles,
									),
									'routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx',
								),
								route(
									'*',
									'routes/authed/staff/tenants/details/_errors/tenant-details-fallback-tab-page.tsx',
								),
							],
						),
					]),
					...prefix(getLastPath(FRONT_PATH_NAMES.staff.staffMembers.root), [
						index(
							'routes/authed/staff/staff-members/list/staff-members-list-page.tsx',
						),
						route(
							getLastPath(FRONT_PATH_NAMES.staff.staffMembers.new),
							'routes/authed/staff/staff-members/new/new-staff-member-page.tsx',
						),
						route(
							getLastPath(
								FRONT_PATH_NAMES.staff.staffMembers.details(':userId'),
								2,
							),
							'routes/authed/staff/staff-members/details/staff-member-details-page.tsx',
						),
					]),
					...prefix(getLastPath(FRONT_PATH_NAMES.staff.invitations.root), [
						index(
							'routes/authed/staff/invitations/list/staff-invitations-list-page.tsx',
						),
						route(
							getLastPath(FRONT_PATH_NAMES.staff.invitations.new),
							'routes/authed/staff/invitations/new/new-staff-invitations-page.tsx',
						),
						route(
							getLastPath(
								FRONT_PATH_NAMES.staff.invitations.details(':invitationId'),
							),
							'routes/authed/staff/invitations/details/staff-invitation-details-page.tsx',
						),
					]),
					...prefix(getLastPath(FRONT_PATH_NAMES.staff.profiles.root), [
						index(
							'routes/authed/staff/profiles/list/staff-profiles-list-page.tsx',
						),
						route(
							getLastPath(FRONT_PATH_NAMES.staff.profiles.new),
							'routes/authed/staff/profiles/new/new-staff-profile-page.tsx',
						),
						route(
							getLastPath(
								FRONT_PATH_NAMES.staff.profiles.details(':profileId').root,
								2,
							),
							'routes/authed/staff/profiles/details/_layout/staff-profile-details-layout.tsx',
							[
								index(
									'routes/authed/staff/profiles/details/basics/staff-profile-details-basics-tab-page.tsx',
								),
								route(
									getLastPath(
										FRONT_PATH_NAMES.staff.profiles.details(':profileId').tabs
											.users,
									),
									'routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx',
								),
								route(
									'*',
									'routes/authed/staff/profiles/details/_errors/staff-profile-details-fallback-tab-page.tsx',
								),
							],
						),
					]),
					route(
						getLastPath(FRONT_PATH_NAMES.staff.settings.root),
						'routes/authed/staff/settings/staff-settings-page.tsx',
					),
					route(
						getLastPath(FRONT_PATH_NAMES.staff.auditLogs.root),
						'routes/authed/staff/audit-logs/staff-audit-logs-page.tsx',
					),
				]),
				route('*', 'routes/authed/staff/_errors/staff-not-found-page.tsx'),
			],
		),
		route(
			getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').root, 2),
			'routes/authed/tenant/_layout/tenant-layout.tsx',
			[
				index('routes/authed/tenant/dashboard/tenant-home-page.tsx'),
				route('analytics', 'routes/authed/tenant/analytics/analytics-page.tsx'),
				route('drafts', 'routes/authed/tenant/drafts/drafts-page.tsx'),
				...prefix('posts', [
					index('routes/authed/tenant/posts/list/posts-list-page.tsx'),
					route(
						'new',
						'routes/authed/tenant/posts/create-edit/post-create-edit-page.tsx',
						{ id: 'tenant-post-create' },
					),
					route(
						':postId/edit',
						'routes/authed/tenant/posts/create-edit/post-create-edit-page.tsx',
						{ id: 'tenant-post-edit' },
					),
				]),
				route('media', 'routes/authed/tenant/media/media-library-page.tsx'),
				route('schedule', 'routes/authed/tenant/schedule/schedule-page.tsx'),
				...prefix('accounts', [
					route(
						'social',
						'routes/authed/tenant/accounts/social-accounts-page.tsx',
					),
				]),
				...prefix('settings', [
					route(
						'general',
						'routes/authed/tenant/settings/general/tenant-settings-general-page.tsx',
					),
					route(
						'members',
						'routes/authed/tenant/settings/members/tenant-settings-members-page.tsx',
					),
					route(
						'invitations',
						'routes/authed/tenant/settings/invitations/tenant-settings-invitations-page.tsx',
					),
					route(
						'profiles',
						'routes/authed/tenant/settings/profiles/tenant-settings-profiles-page.tsx',
					),
					route(
						'billing',
						'routes/authed/tenant/settings/billing/tenant-settings-billing-page.tsx',
					),
				]),
				route('*', 'routes/authed/tenant/_errors/tenant-not-found-page.tsx'),
			],
		),
		...prefix(getLastPath(FRONT_PATH_NAMES.settings.root), [
			route(
				getLastPath(FRONT_PATH_NAMES.settings.profile),
				'routes/authed/settings/profile/user-profile-page.tsx',
			),
			route(
				getLastPath(FRONT_PATH_NAMES.settings.security),
				'routes/authed/settings/security/user-security-page.tsx',
			),
			route(
				getLastPath(FRONT_PATH_NAMES.settings.notifications),
				'routes/authed/settings/notifications/user-notifications-page.tsx',
			),
		]),
	]),
] satisfies RouteConfig;

export default routes;
