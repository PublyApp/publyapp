import type { CrumbSpec } from '~/lib/navigation/breadcrumbs';
import {
	globalTenantUserCrumbQuery,
	selectGlobalTenantUserCrumbName,
} from '~/lib/query/staff-global-tenant-users';

/**
 * Shared trail base for both global tenant-user detail tab routes. The
 * parent path (`/staff/tenant-users/details/$userId`) is a redirect-only
 * bookmark stub with no trail of its own, so each flat tab route declares
 * this full tail (label → entity), per the flat-route breadcrumb contract.
 */
export const tenantUserDetailsCrumbs = (
	params: Record<string, string>,
): readonly CrumbSpec[] => [
	{
		kind: 'label',
		labelKey: 'tenant-user-details',
		to: `/staff/tenant-users/details/${params.userId}/general`,
	},
	{
		kind: 'entity',
		query: globalTenantUserCrumbQuery,
		select: selectGlobalTenantUserCrumbName,
	},
];
