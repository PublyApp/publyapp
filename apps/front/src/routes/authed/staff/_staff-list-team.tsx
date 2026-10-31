import {
	IconClipboardList,
	IconHistory,
	IconMail,
	IconUsers,
} from '@tabler/icons-react';
import type { ListPanelGroup } from '~/components/list/filter-panel';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import {
	toStaffProfileRows,
	useStaffProfilesQuery,
} from '~/lib/query/staff-profiles';
import { toStaffUserRows, useStaffUsersQuery } from '~/lib/query/staff-users';

import { toStaffInvitationRows } from './invitations/list-helpers';

export type StaffTeamSection = 'staff' | 'invitations' | 'profiles';

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
	/** The complete collection, or `null` when the API returned a next cursor. */
	staff: ReturnType<typeof toStaffUserRows> | null;
	invitations: ReturnType<typeof toStaffInvitationRows> | null;
	profiles: ReturnType<typeof toStaffProfileRows> | null;
};

const countWhenComplete = (
	data: { data?: unknown[] | null; nextCursor?: string | null } | undefined,
): number | null =>
	data !== undefined && data.nextCursor == null
		? (data.data?.length ?? 0)
		: null;

/**
 * The side panel's « Équipe » counts, from the same list APIs the pages render.
 * A count is shown only when the API proves the first page is the whole
 * collection (`nextCursor == null`); otherwise it is `null` and renders « — ».
 * No count endpoint exists yet (#2281).
 */
export const useStaffTeamOverview = (): StaffTeamOverview => {
	const staffQuery = useStaffUsersQuery({
		sortId: 'created_at',
		sortOrder: 'desc',
		size: 100,
	});
	const invitationsQuery = useStaffInvitationsQuery({
		sortId: 'created_at',
		sortOrder: 'desc',
		size: 100,
	});
	const profilesQuery = useStaffProfilesQuery({
		sortId: 'created_at',
		sortOrder: 'desc',
		limit: 100,
	});

	const staffComplete = staffQuery.data?.nextCursor == null;
	const invitationsComplete = invitationsQuery.data?.nextCursor == null;
	const profilesComplete = profilesQuery.data?.nextCursor == null;

	return {
		counts: {
			staff: countWhenComplete(staffQuery.data),
			invitations: countWhenComplete(invitationsQuery.data),
			profiles: countWhenComplete(profilesQuery.data),
		},
		staff: staffComplete ? toStaffUserRows(staffQuery.data?.data) : null,
		invitations: invitationsComplete
			? toStaffInvitationRows(invitationsQuery.data?.data)
			: null,
		profiles: profilesComplete
			? toStaffProfileRows(profilesQuery.data?.data)
			: null,
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
				active: false,
				onClick: () => onSelect('/staff/audit-logs'),
			},
		],
	},
];
