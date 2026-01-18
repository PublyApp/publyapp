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
		[index('routes/authed/tenant/posts/posts-calendar-page.tsx')],
	),
];
