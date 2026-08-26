import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import type { GetScopeAuthDataTenant } from '@org/client-ts/models/index';

/**
 * Effective permission keys + account level for ONE scope of the signed-in
 * user (`/auth/scope-auth-data`). This is the payload the rail permission
 * filter (#142) reads: a nav entry whose `requiredPermissions` are not all
 * contained here gets hidden. Hiding is UI-convenience ONLY — every gate
 * behind these keys is independently enforced server-side by
 * `TenantPermissionFilter`.
 *
 * Module-private: consumers go through `useTenantSurfacePermissions` below,
 * which narrows to just the key list and encodes the loading contract.
 */
type ScopeAuthData = {
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

/** Module-private invalidation/removal key base. */
const SCOPE_AUTH_DATA_QUERY_KEY = ['scope-auth-data'] as const;

/**
 * Session-stable per tenant: profile assignments change through admin
 * actions, not during a session, and login/logout already clear the whole
 * cache — so no refocus or interval refetching here.
 *
 * Disabled until the caller has a resolved workspace tenant id; the shell
 * passes `null` while the picker query settles and the entry stays idle.
 * Module-private: callers must use `useTenantSurfacePermissions` so the
 * enabled/loading contract lives in exactly one place.
 */
const useScopeAuthDataQuery = (tenantId: string | null) =>
	useQuery({
		queryKey: [...SCOPE_AUTH_DATA_QUERY_KEY, tenantId],
		queryFn: async () => {
			if (tenantId === null) {
				throw new Error('scope auth data queried without a resolved tenant id');
			}
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

/**
 * The effective permission keys for the CURRENT tenant surface, ready for
 * the rail filter (#142): `undefined` whenever the caller is not a tenant
 * surface, the workspace tenant is unresolved, or the payload is still in
 * flight — callers treat `undefined` as "no filtering" so the full rail
 * renders rather than a lie of a loading state.
 */
export const useTenantSurfacePermissions = (
	enabled: boolean,
): string[] | undefined => {
	// `enabled` must follow the caller's surface: the underlying picker request
	// authenticates with the tenant session token only, so an always-on call
	// from a staff surface fires an unauthenticated 401 whose central backstop
	// logs the user out (same contract as the C3 gates on user-auth-data).
	const workspaceTenantId = useResolvedWorkspaceTenantId({ enabled });
	const query = useScopeAuthDataQuery(enabled ? workspaceTenantId : null);

	return query.data?.permissions;
};
