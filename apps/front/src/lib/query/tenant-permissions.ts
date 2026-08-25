import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

/**
 * Tenant permission gate over the REAL served mechanism:
 * `GET /auth/scope-auth-data?scope={tenantGuid}` whose payload carries
 * FULL `tenant.`-prefixed permission keys (`Permission.CreateTenantPermission`
 * prefixes every tenant key with `tenant.`) plus an `isAdmin` flag.
 */
export const TENANT_PERMISSIONS_QUERY_KEY = ['tenant-permissions'] as const;

/** THE gate key, spelled exactly as `GET /auth/scope-auth-data` emits it on
 * the wire: `Permission.CreateTenantPermission` prefixes every tenant key
 * with `tenant.`. A bare 'socialaccounts.publish' can NEVER match a real
 * payload. */
export const SOCIAL_ACCOUNTS_PUBLISH = 'tenant.socialaccounts.publish';

export interface ScopeAuthDataPayload {
	id?: string | null;
	isAdmin?: boolean | null;
	permissions?: string[] | null;
}

export type TenantPermissions = {
	permissions: string[];
	hasPermission: (key: string) => boolean;
};

const normalizePermissions = (value: string[] | null | undefined): string[] => {
	if (!value || value.length === 0) {
		return [];
	}

	const normalized: string[] = [];
	const seen = new Set<string>();

	for (const entry of value) {
		const trimmed = entry.trim();
		if (trimmed.length === 0 || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		normalized.push(trimmed);
	}

	return normalized;
};

/** Fail-closed exact-key check over a normalized permission list. */
export const hasTenantPermission = (
	permissions: string[] | null | undefined,
	key: string,
): boolean => permissions?.includes(key) ?? false;

/** Pure mapper: scope-auth-data payload → { isAdmin, normalized permissions }. */
export const toTenantPermissions = (
	payload: ScopeAuthDataPayload | null | undefined,
): { isAdmin: boolean; permissions: string[] } => ({
	isAdmin: payload?.isAdmin === true,
	permissions: normalizePermissions(payload?.permissions),
});

const fetchTenantPermissions = async (
	tenantId: string,
): Promise<ScopeAuthDataPayload> => {
	const client = getClientManager().getOrCreateSessionClient();
	const result = await client.auth.scopeAuthData.get({
		queryParameters: { scope: tenantId },
	});

	return result ?? {};
};

/** Session-stable (staleTime Infinity, refetchOnWindowFocus false — same
 * contract as `useCurrentUserQuery`, auth.ts): permissions change only via
 * rare profile-admin actions outside the composer flow.
 * Implicit grant (#1445): `hasPermission` returns true for EVERY tenant key
 * when the payload carries `isAdmin` — mirrors the backend Admin short-circuit
 * (TenantPermissionFilter.cs:49-57, #861) whose subjects hold no profiles,
 * hence an empty `permissions` array. Non-admins fail closed onto the exact
 * key. */
export const useTenantPermissions = (
	tenantId: string | null,
): TenantPermissions => {
	const query = useQuery({
		queryKey: ['tenant', ...TENANT_PERMISSIONS_QUERY_KEY, tenantId],
		queryFn: () => fetchTenantPermissions(tenantId as string),
		enabled: tenantId !== null,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
	});

	const payload = (query.data ?? {}) as ScopeAuthDataPayload;
	const isAdmin = payload.isAdmin === true;
	const permissions = normalizePermissions(payload.permissions);

	return {
		permissions,
		hasPermission: (key: string) =>
			isAdmin || hasTenantPermission(permissions, key),
	};
};
