import {
	IconFileSearch,
	IconShieldLock,
	IconUsers,
	IconUserPlus,
} from '@tabler/icons-react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ListPanelGroup } from '~/components/list/filter-panel';
import {
	STAFF_INVITATIONS_QUERY_KEY,
	staffInvitationsQueryOptions,
	type StaffInvitationsQueryVariables,
} from '~/lib/query/staff-invitations';
import {
	STAFF_PROFILES_QUERY_KEY,
	staffProfilesQueryOptions,
	type StaffProfilesQueryVariables,
} from '~/lib/query/staff-profiles';
import {
	STAFF_USERS_QUERY_KEY,
	staffUsersQueryOptions,
	type StaffUsersQueryVariables,
} from '~/lib/query/staff-users';

import type {
	StaffInvitationListCounts,
	StaffUserListCounts,
} from '@org/client-ts/models/index';
import { scopedKey } from '@org/shared-ts/lib/query/create-hooks';
import type { QueryArgumentRecord } from '@org/shared-ts/lib/query/keys';

export type StaffTeamSection = 'staff' | 'invitations' | 'profiles' | 'audit';

export type StaffTeamPath =
	| '/staff/staff-users'
	| '/staff/invitations'
	| '/staff/profiles'
	| '/staff/audit-logs';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type StaffTeamOverview = {
	counts: {
		staff: number | null;
		invitations: number | null;
		profiles: number | null;
	};
	/** Whole-collection facets behind the StatCards (never the page filters). */
	staffCounts: StaffUserListCounts | null;
	invitationCounts: StaffInvitationListCounts | null;
	/** Every staff profile with its assignment count (the panel's Profils). */
	profiles: { id: string; name: string; memberCount: number }[];
};

/**
 * The side panel's « Équipe » counters, from the lists' own `totalCount`
 * (issue #2301) — one row per list instead of a 100-row page whose length was
 * only a total when the page happened to be the whole collection.
 *
 * A page already rendering one of these lists passes the exact variables of
 * its own query: the shared query key lets TanStack dedupe them into a single
 * request (the KPI counters used to fire a second, distinct `size=1` GET on
 * every staff page). Those variables are published as the counter ONLY when
 * they carry no filter and no search — the API facets the filtered collection,
 * so a filtered response is a slice and would show its numbers on every staff
 * page. Filtered/searched calls fall back to the canonical unfiltered entry.
 */
export type StaffTeamOverviewQueries = {
	staff?: StaffUsersQueryVariables;
	invitations?: StaffInvitationsQueryVariables;
	profiles?: StaffProfilesQueryVariables;
};

/**
 * The counter queries' own variables — deliberately filter- and page-independent
 * so every staff section reads the SAME cache entry. A page rendering a list
 * seeds that entry from its response (below) instead of firing a second GET;
 * a filter change therefore adds only the filtered list request, and navigating
 * away and back reuses the list query.
 */
export const STAFF_TEAM_COUNT_VARIABLES = {
	staff: { size: 1 },
	invitations: { size: 1 },
	profiles: { limit: 100 },
} as const satisfies Required<StaffTeamOverviewQueries>;

/**
 * Counts are a snapshot kept fresh by invalidation, never by timer: a list
 * mutation invalidates the `staff/<list>` prefix, which re-fetches an active
 * counter. This is the ONLY place the team overview overrides freshness — a
 * page's own list keeps the app's normal `staleTime`.
 */
const STAFF_TEAM_COUNT_STALE_TIME = Infinity;

const STAFF_TEAM_COUNT_QUERY_KEYS = {
	staff: STAFF_USERS_QUERY_KEY,
	invitations: STAFF_INVITATIONS_QUERY_KEY,
	profiles: STAFF_PROFILES_QUERY_KEY,
} as const;

/** The canonical counter entry, identical to the key the page list builds for
 * the same variables (`scopedKey('staff', [...QUERY_KEY, variables])`). */
export const staffTeamCountQueryKey = (
	section: keyof typeof STAFF_TEAM_COUNT_VARIABLES,
): QueryKey =>
	scopedKey('staff', [
		...STAFF_TEAM_COUNT_QUERY_KEYS[section],
		STAFF_TEAM_COUNT_VARIABLES[section],
	]);

/**
 * The API facets the FILTERED collection before cursor, ordering and page size
 * (`InvitationQueryService` « Facets over the whole filtered collection »,
 * `StaffUserQueryService`, `StaffProfileQueryAsStaffService`), so only these
 * variables leave `counts`/`totalCount` untouched. Anything else that carries
 * a value — `q`, `status`, `level`, … — is a filter or a search: that response
 * is a slice of the collection and must never be published as the counter.
 * Unknown keys default to « filter » on purpose, so a new filter can only
 * cause an extra counter GET, never a wrong count.
 */
const COUNT_NEUTRAL_QUERY_KEYS: ReadonlySet<string> = new Set([
	'size',
	'limit',
	'sortId',
	'sortOrder',
	'cursor',
]);

/**
 * Never-fetched key for the page-list observer of a section the current page
 * does not render. It must not be the canonical counter key: two observers on
 * one query key overwrite each other's options (`Query.setOptions` takes the
 * last one), and the page observer deliberately carries no `staleTime` — it
 * would hand the counter the default freshness and lose `Infinity`.
 */
const STAFF_TEAM_NO_PAGE_QUERY_KEY: QueryKey = ['staff-team', 'no-page'];

const carriesListFilter = (variables: QueryArgumentRecord): boolean =>
	Object.entries(variables).some(
		([key, value]) =>
			!COUNT_NEUTRAL_QUERY_KEYS.has(key) &&
			value !== undefined &&
			value !== null &&
			value !== '',
	);

type StaffListQueryOptions<TData, TVariables> = {
	queryKey: (variables: TVariables) => QueryKey;
	fetcher: (variables: TVariables) => Promise<TData>;
};

/**
 * One section's numbers: read the page's OWN list entry while it is the whole
 * collection (same key and same normal freshness as the page's `use*Query`),
 * otherwise the canonical counter entry (`staleTime: Infinity` only there).
 * A whole-collection page response is copied to the canonical key so the next
 * staff section reads it instead of issuing a second GET.
 */
const useStaffCounterSection = <TData, TVariables extends QueryArgumentRecord>(
	section: keyof typeof STAFF_TEAM_COUNT_VARIABLES,
	options: StaffListQueryOptions<TData, TVariables>,
	pageVariables: TVariables | undefined,
	counterVariables: TVariables,
): TData | undefined => {
	const queryClient = useQueryClient();
	const pageIsWholeCollection =
		pageVariables !== undefined && !carriesListFilter(pageVariables);
	// oxlint-disable-next-line publy/route-query-preload -- the page's own list, preloaded by its own route; this module is the shared panel, not a Route.
	const pageQuery = useQuery({
		queryKey:
			pageVariables === undefined
				? STAFF_TEAM_NO_PAGE_QUERY_KEY
				: options.queryKey(pageVariables),
		queryFn: () => options.fetcher(pageVariables ?? counterVariables),
		enabled: pageIsWholeCollection,
	});
	// oxlint-disable-next-line publy/route-query-preload -- side-panel counters, secondary data never route-preloaded.
	const counterQuery = useQuery({
		queryKey: staffTeamCountQueryKey(section),
		queryFn: () => options.fetcher(counterVariables),
		staleTime: STAFF_TEAM_COUNT_STALE_TIME,
		// A filtered page owns no whole-collection response: the counter is the
		// only correct source, and it stays in cache (fresh) across filter edits.
		enabled: !pageIsWholeCollection,
	});

	const pageData = pageQuery.data;
	useEffect(() => {
		if (pageIsWholeCollection && pageData !== undefined) {
			queryClient.setQueryData(staffTeamCountQueryKey(section), pageData);
		}
	}, [queryClient, section, pageIsWholeCollection, pageData]);

	return pageIsWholeCollection ? pageData : counterQuery.data;
};

export const useStaffTeamOverview = ({
	staff,
	invitations,
	profiles,
}: StaffTeamOverviewQueries = {}): StaffTeamOverview => {
	const staffData = useStaffCounterSection(
		'staff',
		staffUsersQueryOptions,
		staff,
		STAFF_TEAM_COUNT_VARIABLES.staff,
	);
	const invitationsData = useStaffCounterSection(
		'invitations',
		staffInvitationsQueryOptions,
		invitations,
		STAFF_TEAM_COUNT_VARIABLES.invitations,
	);
	const profilesData = useStaffCounterSection(
		'profiles',
		staffProfilesQueryOptions,
		profiles,
		STAFF_TEAM_COUNT_VARIABLES.profiles,
	);

	return {
		counts: {
			staff: staffData?.totalCount ?? null,
			invitations: invitationsData?.totalCount ?? null,
			profiles: profilesData?.totalCount ?? null,
		},
		staffCounts: staffData?.counts ?? null,
		invitationCounts: invitationsData?.counts ?? null,
		profiles: (profilesData?.data ?? []).flatMap((profile) =>
			profile.id
				? [
						{
							id: profile.id,
							name: profile.name ?? '',
							memberCount: profile.userAccountCount ?? 0,
						},
					]
				: [],
		),
	};
};

/** The staff shell's section links, repeated at the top of the page panel so
 * they can carry real counts (route metadata is static). The shell hides its
 * own copy on these pages through `pageOwnsSecondaryPanel`. */
export const buildStaffTeamPanelGroups = (
	t: Translate,
	current: StaffTeamSection,
	counts: StaffTeamOverview['counts'],
	onSelect: (path: StaffTeamPath) => void,
): ListPanelGroup[] => [
	{
		key: 'team',
		title: t('nav-staff'),
		entries: [
			{
				key: 'staff',
				label: t('nav-staff-all-users'),
				icon: <IconUsers />,
				count: counts.staff,
				active: current === 'staff',
				onClick: () => onSelect('/staff/staff-users'),
			},
			{
				key: 'invitations',
				label: t('nav-staff-invitations'),
				icon: <IconUserPlus />,
				count: counts.invitations,
				active: current === 'invitations',
				onClick: () => onSelect('/staff/invitations'),
			},
			{
				key: 'profiles',
				label: t('nav-staff-profiles'),
				icon: <IconShieldLock />,
				count: counts.profiles,
				active: current === 'profiles',
				onClick: () => onSelect('/staff/profiles'),
			},
			{
				key: 'audit',
				label: t('nav-staff-audit-logs'),
				icon: <IconFileSearch />,
				// A view, not a collection: no counter (§2.8).
				active: current === 'audit',
				onClick: () => onSelect('/staff/audit-logs'),
			},
		],
	},
];

/**
 * The staff list's « Profils » shortcuts: every staff profile with its
 * assignment count, as the prototype's panel. The staff-list API exposes no
 * profile facet, so an entry opens the profile's own member list rather than
 * pretending to filter rows it cannot see.
 */
export const buildStaffProfilesPanelGroup = (
	t: Translate,
	profiles: StaffTeamOverview['profiles'],
	onSelect: (profileId: string) => void,
): ListPanelGroup[] => [
	{
		key: 'staff-profiles',
		title: t('profiles'),
		entries: profiles.map((profile) => ({
			key: `profile:${profile.id}`,
			label: profile.name,
			icon: <IconShieldLock />,
			count: profile.memberCount,
			active: false,
			onClick: () => onSelect(profile.id),
		})),
	},
];
