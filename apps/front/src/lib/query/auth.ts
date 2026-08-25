import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { normalizeNullableFileUrl } from '~/lib/api-client/resolve-api-file-url';

import type { GetUserAuthDataResult } from '@org/client-ts/models/index';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

export type CurrentUser = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	displayName: string | null;
	/** The caller's EFFECTIVE tenant permission set (C3 A4): `["*"]` when the
	 * resolved account is a tenant Admin, otherwise the profile-derived keys.
	 * Empty array while unscoped or for users with no tenant permissions. */
	tenantPermissionKeys: string[];
};

/** @internal Build an invalidation/removal key from this via `scopedKey()`
 * rather than hand-assembling a prefixed array at a call site. */
export const CURRENT_USER_QUERY_KEY = ['current-user'] as const;

const normalizeString = (value: string | null | undefined): string | null => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

export const toCurrentUser = (
	result: GetUserAuthDataResult | null | undefined,
): CurrentUser | null => {
	const id = normalizeString(result?.id ?? undefined);
	if (!id) {
		return null;
	}

	const firstName = normalizeString(result?.firstName);
	const lastName = normalizeString(result?.lastName);

	// The generated model types this list as (string | null)[]; keep only real
	// key strings so the front never renders or compares a null permission.
	const tenantPermissionKeys = Array.isArray(result?.tenantPermissionKeys)
		? result.tenantPermissionKeys.filter(
				(key): key is string => typeof key === 'string' && key.length > 0,
			)
		: [];

	return {
		id,
		email: normalizeString(result?.email) ?? '',
		firstName,
		lastName,
		avatarUrl: normalizeNullableFileUrl(result?.avatarUrl),
		displayName: getUserFullName({ firstName, lastName }) || null,
		tenantPermissionKeys,
	};
};

// `/auth/user-auth-data` is scope-agnostic: it must authenticate whichever
// account is signed in (tenant or staff), so this bypasses the staff-only
// `buildStaffQueryOptions` factory and reads through the session-neutral
// client instead (r3-shell-F3 — a tenant session was previously invisible
// here, since `getOrCreateStaffClient()` never carries a tenant token).
const fetchCurrentUser = async (): Promise<GetUserAuthDataResult> => {
	const client = getClientManager().getOrCreateSessionClient();
	const result = await client.auth.userAuthData.get();

	if (!result) {
		throw new Error('current user auth data result was empty');
	}

	return result;
};

type CurrentUserQueryOptions = {
	enabled?: boolean;
	retry?: boolean;
	/**
	 * The auth surface (e.g. `accept-invitation.tsx`) reuses this
	 * scope-agnostic query to detect an already-signed-in visitor, where a
	 * 401 is an expected, normal outcome. Setting this attaches
	 * `meta.skipAuthedErrorBackstop` so the central `handleAuthedQueryError`
	 * backstop (router.tsx, shell-r6-F2) ignores this query's errors
	 * regardless of `window.location.pathname` at the time it settles —
	 * closing the race where a cross-tab login navigates this tab to
	 * `/staff`/`/tenant` while this request is still in flight.
	 */
	authSurface?: boolean;
};

// Session-stable: the signed-in user only changes on login/logout, both of
// which already invalidate this query explicitly (tab-sync-listener's
// cross-tab 'login'/'logout' handlers, use-logout's same-tab clear()) — a
// tab-refocus refetch is redundant, not a freshness fix.
export const useCurrentUserQuery = (options?: CurrentUserQueryOptions) =>
	useQuery({
		queryKey: [...CURRENT_USER_QUERY_KEY],
		queryFn: fetchCurrentUser,
		enabled: options?.enabled,
		retry: options?.retry,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		meta: options?.authSurface ? { skipAuthedErrorBackstop: true } : undefined,
	});
