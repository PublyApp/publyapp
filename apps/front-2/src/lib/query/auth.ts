import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { normalizeNullableFileUrl } from '~/lib/api-client/resolve-api-file-url';

import type { GetUserAuthDataResult } from '@org/client-ts/src/models/index.js';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

export type CurrentUser = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	displayName: string | null;
};

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

	return {
		id,
		email: normalizeString(result?.email) ?? '',
		firstName,
		lastName,
		avatarUrl: normalizeNullableFileUrl(result?.avatarUrl),
		displayName: getUserFullName({ firstName, lastName }) || null,
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
	});
