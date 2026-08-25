import { useMemo } from 'react';
import { useCurrentUserQuery } from '~/lib/query/auth';

const WILDCARD_SENTINEL = '*';
const SOCIAL_VIEW_PERMISSION = 'tenant.socialaccounts.view';

/** Permission gate for UI affordances. Defaults to `false` while the session
 * loads — actions appear late, never act without the right. */
export const useHasTenantPermission = (key: string): boolean => {
	const { data } = useCurrentUserQuery();
	// The session query carries the RAW generated model whose list may be
	// null/undefined before load or on older payloads; normalise defensively.
	const keys = data?.tenantPermissionKeys;

	return useMemo(() => {
		if (!keys || keys.length === 0) {
			return false;
		}

		// "*" is the Admin sentinel materialised by the backend (C3 A4):
		// AccountLevel.Admin holders pass every tenant-permission gate.
		return keys.includes(key) || keys.includes(WILDCARD_SENTINEL);
	}, [keys, key]);
};

/** Convenience wrapper for the social slice. */
export const useCanManageSocialAccounts = (): boolean =>
	useHasTenantPermission('tenant.socialaccounts.manage');

export const useCanViewIntegrations = (): boolean =>
	useHasTenantPermission(SOCIAL_VIEW_PERMISSION);
