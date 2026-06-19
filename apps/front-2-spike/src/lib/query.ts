import { queryOptions } from '@tanstack/react-query';

import type { ApiClient } from '@org/client-ts/src/apiClient';

import { createClient } from './api-client';
import { getSessionTokensFromClient } from './session-cookie-client';

export type StaffUsersVars = {
	q?: string;
	sortId?: string;
	sortOrder?: 'asc' | 'desc';
	cursor?: string;
	probe?: 'virtualization';
};

type StaffUsersQueryVars = Omit<StaffUsersVars, 'probe'>;

// ONE shared key for server+client hydration match.
const pickStaffUsersQueryVars = (vars: StaffUsersVars): StaffUsersQueryVars => {
	const { probe: _probe, ...queryVars } = vars;
	return queryVars;
};

export const staffUsersKey = (vars: StaffUsersVars) =>
	['staff', 'users', pickStaffUsersQueryVars(vars)] as const;

const fetchStaffUsers = async (client: ApiClient, vars: StaffUsersVars) => {
	const queryVars = pickStaffUsersQueryVars(vars);

	const res = await client.staff.users.get({
		queryParameters: {
			q: queryVars.q,
			sortId: queryVars.sortId,
			sortOrder: queryVars.sortOrder,
			cursor: queryVars.cursor,
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
		queryFn: () =>
			fetchStaffUsers(
				createClient({
					sessionToken: resolveStaffUsersBrowserSessionToken(),
					base: 'public',
				}),
				vars,
			),
	});

export const getStaffUsersBrowserSessionToken = () =>
	resolveStaffUsersBrowserSessionToken();

// NOTE: authed routes are CSR (ssr:false), so there is no SSR server-prime for
// staff data — the browser query above is the single client-side data path.
// A per-request server-query helper (for a future SSR data route) would build a
// per-request Kiota client from the request cookie; intentionally omitted here.
