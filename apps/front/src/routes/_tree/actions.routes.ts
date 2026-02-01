import { route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared/lib/constants';
import { getLastPath } from '@org/shared/utils/string.utils';

export const actionsRoutes = [
	// Action-only route for clearing httpOnly session cookies
	// (POST + Origin/Fetch-metadata validation)
	route(
		getLastPath(FRONT_PATH_NAMES.auth.clearSession, 2),
		'routes/auth/clear-session.tsx',
	),
];
