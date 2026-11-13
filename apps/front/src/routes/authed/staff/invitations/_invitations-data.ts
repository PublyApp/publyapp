import { useMemo } from 'react';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import type { StaffInvitationsQueryVariables } from '~/lib/query/staff-invitations';
import {
	staffRolesQueryOptions,
	useStaffRolesQuery,
} from '~/lib/query/staff-roles';

/** Every staff role, by name: the lookup that resolves a role filter (a legacy
 * `?role=<name>` link, or an id whose role may be gone). Deliberately not the
 * list's role facet, which only holds roles with invitations under the current
 * search/status. A distinct sort keeps it off the team counter's cache entry. */
export const ROLES_LOOKUP_VARIABLES = {
	limit: 100,
	sortId: 'name',
	sortOrder: 'asc',
} as const;

export { staffRolesQueryOptions };

export type RolesLookup = {
	roles: readonly { id?: string | null; name?: string | null }[];
	/** The list has loaded (a failed lookup is settled but not loaded). */
	loaded: boolean;
	settled: boolean;
};

/** Pure enrichment with no loading surface of its own, so it lives in a data
 * hook (`publy/prefer-query-display` only checks JSX-returning functions; same
 * shape as `_staff-list-team.tsx`'s counter hook). */
export const useRolesLookup = (): RolesLookup => {
	const lookup = useStaffRolesQuery(ROLES_LOOKUP_VARIABLES);
	const roles = useMemo(() => lookup.data?.data ?? [], [lookup.data]);
	return {
		roles,
		loaded: lookup.data !== undefined,
		settled: lookup.status !== 'pending',
	};
};

/** The invitations list. While a legacy role name is unresolved the request is
 * not made and the list stays in its loading state — even when the unfiltered
 * first page is already cached by the loader — so it never flashes unfiltered. */
export const useInvitationsListQuery = (
	variables: StaffInvitationsQueryVariables,
	isHeld: boolean,
) => {
	const listQuery = useStaffInvitationsQuery(variables, { enabled: !isHeld });
	if (!isHeld) {
		return listQuery;
	}
	return {
		...listQuery,
		data: undefined,
		isPending: true,
		isLoading: true,
		isFetching: true,
		isError: false,
		error: null,
	};
};
