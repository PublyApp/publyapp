import { useEffect, useMemo, useState } from 'react';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import type { StaffInvitationsQueryVariables } from '~/lib/query/staff-invitations';
import { useStaffRolesQuery } from '~/lib/query/staff-roles';

import {
	serializeInvitationListSearchParams,
	serializeInvitationRoleFilter,
	type InvitationListSearchParams,
} from './list-helpers';

/** Every staff role, by name: the lookup that resolves a role filter (a legacy
 * `?role=<name>` link, or an id whose role may be gone). Deliberately not the
 * list's role facet, which only holds roles with invitations under the current
 * search/status. A distinct sort keeps it off the team counter's cache entry. */
export const ROLES_LOOKUP_VARIABLES = {
	limit: 100,
	sortId: 'name',
	sortOrder: 'asc',
} as const;

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

export const ROLE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RoleSource = { id?: string | null; name?: string | null };

/** A role filter value against a list of roles: a legacy name becomes its id; a
 * name no role carries resolves to nothing. An id is kept as is unless `mustExist`
 * (the list is authoritative) and no role carries it (the role is gone). */
const resolveRoleValue = (
	value: string,
	sources: readonly RoleSource[],
	mustExist: boolean,
): string | undefined => {
	if (ROLE_ID_PATTERN.test(value)) {
		if (!mustExist || sources.some((role) => role.id === value)) {
			return value;
		}
		return undefined;
	}
	const wanted = value.toLowerCase();
	return (
		sources.find((role) => role.name?.trim().toLowerCase() === wanted)?.id ??
		undefined
	);
};

const resolveAll = (
	values: readonly string[],
	sources: readonly RoleSource[],
	mustExist: boolean,
): string[] => {
	const ids = new Set<string>();
	for (const value of values) {
		const id = resolveRoleValue(value, sources, mustExist);
		if (id !== undefined) {
			ids.add(id);
		}
	}
	return [...ids];
};

/** Resolves the URL role values synchronously. Roles lookup loaded: it is
 * authoritative (names resolve, gone ids drop). Otherwise ids are kept and names
 * resolve against the list's role facet (roles ∪ facet) once it is known. */
export const resolveEffectiveRoleIds = (
	values: readonly string[],
	lookup: RolesLookup,
	facet: readonly RoleSource[] | null,
): string[] =>
	lookup.loaded
		? resolveAll(values, lookup.roles, true)
		: resolveAll(values, [...lookup.roles, ...(facet ?? [])], false);

/** Role-filter state shared by the page: the roles lookup, the latched facet
 * and the ids the list is filtered by (derived in render, no effect gap). */
export const useInvitationRoleFilter = (values: readonly string[]) => {
	const hasLegacyRoleName = values.some(
		(value) => !ROLE_ID_PATTERN.test(value),
	);
	const rolesLookup = useRolesLookup();
	// Facet latch: a failed lookup resolves names from the list's own facet; the
	// latch keeps that resolution stable while the filtered request loads.
	const [latchedFacet, setLatchedFacet] = useState<RoleSource[] | null>(null);
	const ids = resolveEffectiveRoleIds(
		values,
		rolesLookup,
		// Only a settled-but-failed lookup falls back to the facet.
		rolesLookup.settled ? latchedFacet : null,
	);
	return {
		hasLegacyRoleName,
		rolesLookup,
		latchedFacet,
		setLatchedFacet,
		ids,
		idsCsv: ids.join(','),
		unresolvedName: hasLegacyRoleName && ids.length < values.length,
		canRewrite:
			rolesLookup.loaded ||
			(rolesLookup.settled && latchedFacet !== null) ||
			(rolesLookup.settled && !hasLegacyRoleName),
	};
};

/** Cosmetic URL rewrite to the effective ids, once the lookup settled (and, when
 * it failed, once the facet arrived so names can still resolve). */
export const useRoleFilterUrlRewrite = ({
	values,
	ids,
	canRewrite,
	search,
	navigate,
}: {
	values: readonly string[];
	ids: readonly string[];
	canRewrite: boolean;
	search: InvitationListSearchParams;
	navigate: (options: {
		search: InvitationListSearchParams;
		replace: boolean;
	}) => Promise<void> | void;
}): void => {
	const valuesKey = values.join(',');
	const idsKey = ids.join(',');
	useEffect(() => {
		if (canRewrite && valuesKey.length > 0 && valuesKey !== idsKey) {
			void navigate({
				search: serializeInvitationListSearchParams({
					...search,
					role: serializeInvitationRoleFilter(
						idsKey.split(',').filter(Boolean),
					),
					cursor: undefined,
				}) as InvitationListSearchParams,
				replace: true,
			});
		}
		// `search`/`navigate` are read at fire time; the keys are the triggers.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [canRewrite, valuesKey, idsKey]);
};

/** The invitations list. While a legacy role name cannot be resolved yet the
 * request is not made (`isFetchHeld`), and the list stays in its loading state
 * (`isDisplayHeld`) even when the unfiltered first page is already cached by the
 * loader, so it never paints unfiltered. A held display is released by a failed
 * request: an error beats an endless skeleton. */
export const useInvitationsListQuery = (
	variables: StaffInvitationsQueryVariables,
	hold: { isFetchHeld: boolean; isDisplayHeld: boolean },
) => {
	const listQuery = useStaffInvitationsQuery(variables, {
		enabled: !hold.isFetchHeld,
	});
	const facetRoles = listQuery.data?.counts?.roleCounts ?? null;
	if (!hold.isDisplayHeld || listQuery.error !== null) {
		return { ...listQuery, facetRoles };
	}
	return {
		...listQuery,
		facetRoles,
		data: undefined,
		isPending: true,
		isLoading: true,
		isFetching: true,
		isError: false,
		error: null,
	};
};
