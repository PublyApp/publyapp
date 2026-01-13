import { useLocation } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { getSessionTokensFromClient } from '#app/lib/cookies/session-cookie.utils.ts';

export const useHomePath = () => {
	const location = useLocation();

	// if in staff dashboard
	if (location.pathname.startsWith(FRONT_PATH_NAMES.staff.root)) {
		return FRONT_PATH_NAMES.staff.root;
	}

	const tenantRootPath = FRONT_PATH_NAMES.tenant().root;

	// if in tenant dashboard
	if (location.pathname.startsWith(tenantRootPath)) {
		return tenantRootPath;
	}

	return FRONT_PATH_NAMES.home;
};
