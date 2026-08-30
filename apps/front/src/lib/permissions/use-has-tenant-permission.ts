import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getClientManager } from '~/lib/api-client/client-manager';
// The ACTIVE WORKSPACE tenant as the shell itself resolves it (persisted
// preference when it names an active tenant in the picker list, otherwise a
// lone active tenant auto-resolves) — NOT an auth source: the tenant-scoped
// session cookie authorizes the request; this value only picks the
// ?tenant_id= scope. Reading through the shell's own resolver keeps this gate
// and TenantAuthFilter on the same tenant even when the preference was never
// written (selection persists only through an explicit picker choice).
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

const WILDCARD_SENTINEL = '*';
const SOCIAL_VIEW_PERMISSION = 'tenant.socialaccounts.view';

/** Wire shape of GET /auth/user-auth-data (only what the gates read). */
type TenantPermissionKeysResult = {
	/** EFFECTIVE set for ?tenant_id= (C3 A4): `["*"]` for a tenant Admin,
	 * profile-derived keys otherwise, `[]` when the scope is unusable. */
	tenantPermissionKeys: string[];
};

/**
 * The session query scoped to the ACTIVE WORKSPACE tenant.
 *
 * Why not reuse `useCurrentUserQuery`: that surface is deliberately
 * scope-agnostic (`r3-shell-F3` — it must answer for whichever account is
 * signed in, staff or tenant) and therefore sends no `?tenant_id=`. The C3
 * backend handler resolves the effective permission set for the requested
 * scope and answers `[]` when none is supplied, so an unscoped consumer can
 * never see keys (C3 defect 5: the plan's Task 2 front half missed this).
 *
 * Keyed per tenant id and enabled only once one is resolved: no request fires
 * without a usable scope (the backend would gate everything closed anyway).
 * Session-stable like `useCurrentUserQuery` — invalidation happens on
 * login/logout/tab-sync, which clear or invalidate the whole cache
 * (`queryClient.clear()` in use-logout / tab-sync-listener).
 *
 * Reads through the scope-neutral session client: neither the staff client nor
 * the tenant-header client applies to `/auth/user-auth-data`, which takes its
 * scope as a query parameter (r3-shell-F3 precedent in fetchCurrentUser).
 */
const useTenantScopedAuthDataQuery = () => {
	const tenantId = useResolvedWorkspaceTenantId();

	return useQuery<TenantPermissionKeysResult>({
		queryKey: ['current-user', 'tenant-permission-keys', tenantId],
		queryFn: async (): Promise<TenantPermissionKeysResult> => {
			const client = getClientManager().getOrCreateSessionClient();
			const result = await client.auth.userAuthData.get({
				queryParameters: { tenantId: tenantId ?? undefined },
			});
			if (!result) {
				throw new Error('user auth data result was empty');
			}
			// The generated model widens this list to (string|null)[]|null;
			// normalise so the gate below never sees null holes (same defence
			// as toCurrentUser's mapper in lib/query/auth.ts).
			const keys = Array.isArray(result.tenantPermissionKeys)
				? result.tenantPermissionKeys.filter(
						(k): k is string => typeof k === 'string' && k.length > 0,
					)
				: [];
			return { tenantPermissionKeys: keys };
		},
		enabled: tenantId !== null,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		retry: false,
	});
};

/** Permission gate for UI affordances. Defaults to `false` while the session
 * loads or before a workspace tenant is resolved — actions appear late, never
 * act without the right. */
export const useHasTenantPermission = (key: string): boolean => {
	const { data } = useTenantScopedAuthDataQuery();
	const rawKeys = data?.tenantPermissionKeys;

	return useMemo(() => {
		if (!rawKeys || rawKeys.length === 0) {
			return false;
		}

		// "*" is the Admin sentinel materialised by the backend (C3 A4):
		// AccountLevel.Admin holders pass every tenant-permission gate.
		return rawKeys.includes(key) || rawKeys.includes(WILDCARD_SENTINEL);
	}, [rawKeys, key]);
};

/** Convenience wrapper for the social slice. */
export const useCanManageSocialAccounts = (): boolean =>
	useHasTenantPermission('tenant.socialaccounts.manage');

// Deleted: useCanViewIntegrations was exported but never consumed. The Integrations
// screen gate is `useCanManageSocialAccounts` — a view-only holder must not see
// action affordances, and the route itself is independently protected server-side.
// Wire it on the rail entry's `requiredPermissions` only if a secondary-panel
// entry or rail visibility filter for Integrations is added.
