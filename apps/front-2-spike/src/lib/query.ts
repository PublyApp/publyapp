import { queryOptions } from '@tanstack/react-query';

import type { ApiClient } from '@org/client-ts/src/apiClient';

import { createClient } from './api-client';
import { getSessionTokensFromClient } from './session-cookie-client';

export type StaffUsersVars = {
	q?: string;
	sortId?: string;
	sortOrder?: 'asc' | 'desc';
	cursor?: string;
};

// ONE shared key for server+client hydration match.
export const staffUsersKey = (vars: StaffUsersVars) =>
	['staff', 'users', vars] as const;

const fetchStaffUsers = async (client: ApiClient, vars: StaffUsersVars) => {
	const res = await client.staff.users.get({
		queryParameters: {
			q: vars.q,
			sortId: vars.sortId,
			sortOrder: vars.sortOrder,
			cursor: vars.cursor,
			limit: '25',
		},
	});
	if (!res) {
		throw new Error('staff users result was empty');
	}
	return res;
};

const resolveStaffUsersBrowserSessionToken = () => {
	const { staffToken, tenantToken } = getSessionTokensFromClient();
	return staffToken ?? tenantToken;
};

export const staffUsersBrowserQuery = (vars: StaffUsersVars = {}) =>
	queryOptions({
		queryKey: staffUsersKey(vars),
		queryFn: () => {
			return fetchStaffUsers(
				createClient({
					sessionToken: resolveStaffUsersBrowserSessionToken(),
					base: 'public',
				}),
				vars,
			);
		},
	});

export const getStaffUsersBrowserSessionToken = () =>
	resolveStaffUsersBrowserSessionToken();

export const staffUsersServerQueryOptions = (
	vars: StaffUsersVars,
	serverClient: ApiClient,
) => ({
	queryKey: staffUsersKey(vars),
	queryFn: () => fetchStaffUsers(serverClient, vars),
});
