import {
	IconClipboardList,
	IconHistory,
	IconMail,
	IconUsers,
} from '@tabler/icons-react';
import type { ListPanelGroup } from '~/components/list/filter-panel';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import { useStaffProfilesQuery } from '~/lib/query/staff-profiles';
import { useStaffUsersQuery } from '~/lib/query/staff-users';

import type {
	StaffInvitationListCounts,
	StaffUserListCounts,
} from '@org/client-ts/models/index';

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
};

/**
 * The side panel's « Équipe » counters, from the lists' own `totalCount`
 * (issue #2301) — one row per list instead of a 100-row page whose length was
 * only a total when the page happened to be the whole collection.
 */
export const useStaffTeamOverview = (): StaffTeamOverview => {
	const staffQuery = useStaffUsersQuery({ size: 1 });
	const invitationsQuery = useStaffInvitationsQuery({ size: 1 });
	const profilesQuery = useStaffProfilesQuery({ limit: 1 });

	return {
		counts: {
			staff: staffQuery?.data?.totalCount ?? null,
			invitations: invitationsQuery?.data?.totalCount ?? null,
			profiles: profilesQuery?.data?.totalCount ?? null,
		},
		staffCounts: staffQuery?.data?.counts ?? null,
		invitationCounts: invitationsQuery?.data?.counts ?? null,
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
				icon: <IconMail />,
				count: counts.invitations,
				active: current === 'invitations',
				onClick: () => onSelect('/staff/invitations'),
			},
			{
				key: 'profiles',
				label: t('nav-staff-profiles'),
				icon: <IconClipboardList />,
				count: counts.profiles,
				active: current === 'profiles',
				onClick: () => onSelect('/staff/profiles'),
			},
			{
				key: 'audit',
				label: t('nav-staff-audit-logs'),
				icon: <IconHistory />,
				// A view, not a collection: no counter (§2.8).
				active: current === 'audit',
				onClick: () => onSelect('/staff/audit-logs'),
			},
		],
	},
];
