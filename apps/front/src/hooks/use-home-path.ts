import { useLocation } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { getSessionTokensFromClient } from '#app/lib/cookies/session-cookie.utils.ts';

export const useHomePath = () => {
	const location = useLocation();

	const staffRootPath = FRONT_PATH_NAMES.staff.root;
	const tenantRootPath = FRONT_PATH_NAMES.tenant().root;

	// Prefer auth scope from session cookie over URL (handles cross-scope 403 pages).
	// Must be guarded for SSR (document is undefined).
	if (typeof document !== 'undefined') {
		const { staffToken, tenantToken } = getSessionTokensFromClient();

		// Impersonation cookie can contain both tokens; use current subtree to decide.
		if (staffToken && tenantToken) {
			if (location.pathname.startsWith(staffRootPath)) {
				return staffRootPath;
			}

			return tenantRootPath;
		}

		if (staffToken) {
			return staffRootPath;
		}

		if (tenantToken) {
			return tenantRootPath;
		}
	}

	// if in staff dashboard
	if (location.pathname.startsWith(staffRootPath)) {
		return staffRootPath;
	}

	// if in tenant dashboard
	if (location.pathname.startsWith(tenantRootPath)) {
		return tenantRootPath;
	}

	return FRONT_PATH_NAMES.home;
};
