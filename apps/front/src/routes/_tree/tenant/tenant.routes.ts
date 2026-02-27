import { index, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

const PATHS = FRONT_PATH_NAMES.tenant(':tenantId');
const TENANT_ROUTE_SEGMENTS = {
	portal: getLastPath(PATHS._root),
	organizations: getLastPath(PATHS.organizations, 2),
	root: getLastPath(PATHS.root, 2),
	postsRoot: getLastPath(PATHS.posts.root),
	postsDrafts: getLastPath(PATHS.posts.drafts, 2),
	postsHistory: getLastPath(PATHS.posts.history, 2),
	settingsRoot: getLastPath(PATHS.settings.root),
	accountRoot: getLastPath(PATHS.account.root),
} as const;

export const tenantRoutes = [
	route(
		TENANT_ROUTE_SEGMENTS.portal,
		'routes/authed/tenant/_portal/tenant-portal-page.tsx',
	),
	route(
		TENANT_ROUTE_SEGMENTS.organizations,
		'routes/authed/tenant/organizations/organizations-page.tsx',
	),
	route(
		TENANT_ROUTE_SEGMENTS.root,
		'routes/authed/tenant/_layout/tenant-layout.tsx',
		[
			index('routes/authed/tenant/posts/posts-calendar-page.tsx'),
			route(
				TENANT_ROUTE_SEGMENTS.postsRoot,
				'routes/authed/tenant/posts/posts-queue-page.tsx',
			),
			route(
				TENANT_ROUTE_SEGMENTS.postsDrafts,
				'routes/authed/tenant/posts/posts-drafts-page.tsx',
			),
			route(
				TENANT_ROUTE_SEGMENTS.postsHistory,
				'routes/authed/tenant/posts/posts-history-page.tsx',
			),
			// Organization Settings routes
			route(
				TENANT_ROUTE_SEGMENTS.settingsRoot,
				'routes/authed/tenant/settings/_layout/settings-layout.tsx',
				[
					index(
						'routes/authed/tenant/settings/general/settings-general-page.tsx',
					),
					route(
						'members',
						'routes/authed/tenant/settings/members/settings-members-page.tsx',
					),
					route(
						'roles',
						'routes/authed/tenant/settings/roles/settings-roles-page.tsx',
					),
					route(
						'workspaces',
						'routes/authed/tenant/settings/workspaces/settings-workspaces-page.tsx',
					),
					route(
						'integrations',
						'routes/authed/tenant/settings/integrations/settings-integrations-page.tsx',
					),
					route(
						'billing',
						'routes/authed/tenant/settings/billing/settings-billing-page.tsx',
					),
					route(
						'security',
						'routes/authed/tenant/settings/security/settings-security-page.tsx',
					),
					route(
						'*',
						'routes/authed/tenant/settings/_errors/settings-not-found-page.tsx',
					),
				],
			),
			// Personal Account routes
			route(
				TENANT_ROUTE_SEGMENTS.accountRoot,
				'routes/authed/tenant/account/_layout/account-layout.tsx',
				[
					index(
						'routes/authed/tenant/account/profile/account-profile-page.tsx',
					),
					route(
						'security',
						'routes/authed/tenant/account/security/account-security-page.tsx',
					),
					route(
						'notifications',
						'routes/authed/tenant/account/notifications/account-notifications-page.tsx',
					),
					route(
						'*',
						'routes/authed/tenant/account/_errors/account-not-found-page.tsx',
					),
				],
			),
			route('*', 'routes/authed/tenant/_errors/tenant-not-found-page.tsx'),
		],
	),
];
