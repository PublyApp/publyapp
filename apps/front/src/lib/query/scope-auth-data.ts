import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { GetScopeAuthDataTenant } from '@org/client-ts/models/index';

/**
 * Effective permission keys + account level for ONE scope of the signed-in
 * user (`/auth/scope-auth-data`). This is the payload the rail permission
 * filter (#142) reads: a nav entry whose `requiredPermissions` are not all
 * contained here gets hidden. Hiding is UI-convenience ONLY — every gate
 * behind these keys is independently enforced server-side by
 * `TenantPermissionFilter`.
 */
export type ScopeAuthData = {
	isAdmin: boolean;
	permissions: string[];
};

const normalizeScopeAuthData = (
	result: GetScopeAuthDataTenant | undefined,
): ScopeAuthData => ({
	isAdmin: result?.isAdmin ?? false,
	permissions: (result?.permissions ?? []).filter(
		(key) => typeof key === 'string' && key.length > 0,
	),
});

/** @internal Build an invalidation/removal key from this via `scopedKey()`
 * rather than hand-assembling a prefixed array at a call site. */
export const SCOPE_AUTH_DATA_QUERY_KEY = ['scope-auth-data'] as const;

/**
 * Session-stable per tenant: profile assignments change through admin
 * actions, not during a session, and login/logout already clear the whole
 * cache — so no refocus or interval refetching here.
 *
 * Disabled until the caller has a resolved workspace tenant id; the shell
 * passes `null` while the picker query settles and the entry stays idle.
 */
export const useScopeAuthDataQuery = (tenantId: string | null) =>
	useQuery({
		queryKey: [...SCOPE_AUTH_DATA_QUERY_KEY, tenantId],
		queryFn: async () => {
			const client = getClientManager().getOrCreateTenantScopeClient();
			const result = await client.auth.scopeAuthData.get({
				queryParameters: { scope: tenantId },
			});
			return normalizeScopeAuthData(result);
		},
		enabled: tenantId !== null,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		gcTime: Infinity,
	});
