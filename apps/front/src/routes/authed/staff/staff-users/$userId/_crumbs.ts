import type { CrumbSpec } from '~/lib/navigation/breadcrumbs';
import {
	selectStaffUserCrumbName,
	staffUserCrumbQuery,
} from '~/lib/query/staff-users';

/**
 * Shared trail base for the staff-user detail route AND every one of its
 * true nested children (`index`/`permissions`/`activity`/`settings`) — this
 * IS a genuinely nested route (unlike the flat tenant-profile detail route),
 * so each child still declares its own full tail (the mechanism is uniform
 * repo-wide), but they all share this common prefix rather than repeating
 * the entity spec by hand.
 */
export const staffUserCrumbsBase = (
	params: Record<string, string>,
): readonly CrumbSpec[] => [
	{ kind: 'label', labelKey: 'nav-staff-breadcrumb', to: '/staff/staff-users' },
	{
		kind: 'entity',
		to: `/staff/staff-users/${params.userId}`,
		query: staffUserCrumbQuery,
		select: selectStaffUserCrumbName,
	},
];
