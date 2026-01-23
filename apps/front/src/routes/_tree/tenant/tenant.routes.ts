import { index, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

export const tenantRoutes = [
	route(
		getLastPath(FRONT_PATH_NAMES.tenant(':tenantId')._root),
		'routes/authed/tenant/_portal/tenant-portal-page.tsx',
	),
	route(
		getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').root, 2),
		'routes/authed/tenant/_layout/tenant-layout.tsx',
		[
			index('routes/authed/tenant/posts/posts-calendar-page.tsx'),
			route(
				getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').posts.root),
				'routes/authed/tenant/posts/posts-queue-page.tsx',
			),
			route(
				getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').posts.drafts, 2),
				'routes/authed/tenant/posts/posts-drafts-page.tsx',
			),
			route(
				getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').posts.history, 2),
				'routes/authed/tenant/posts/posts-history-page.tsx',
			),
			// Organization Settings routes
			route(
				getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').settings.root),
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
				getLastPath(FRONT_PATH_NAMES.tenant(':tenantId').account.root),
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
