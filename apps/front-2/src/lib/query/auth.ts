import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type { GetUserAuthDataResult } from '@org/client-ts/src/models/index.js';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';
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

type CurrentUserQueryVariables = Record<string, never>;

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
		avatarUrl: normalizeString(result?.avatarUrl),
		displayName: getUserFullName({ firstName, lastName }) || null,
	};
};

const currentUserQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetUserAuthDataResult,
	CurrentUserQueryVariables
>(
	{
		queryKeyFn: () => [...CURRENT_USER_QUERY_KEY],
		fetcher: async (client) => {
			const result = await client.auth.userAuthData.get();

			if (!result) {
				throw new Error('current user auth data result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

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
		queryKey: currentUserQueryOptions.queryKey({}),
		queryFn: () => currentUserQueryOptions.fetcher({}),
		enabled: options?.enabled,
		retry: options?.retry,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
	});
