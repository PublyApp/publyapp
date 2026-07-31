import type { CrumbSpec } from '~/lib/navigation/breadcrumbs';
import {
	selectStaffTenantProfileCrumbName,
	staffTenantProfileCrumbQuery,
} from '~/lib/query/staff-tenant-profiles';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
} from '~/lib/query/staff-tenants';

/**
 * Shared trail base for the tenant-profile detail LAYOUT route and every one
 * of its section children (`index`/`permissions`/`members`). Each route still
 * declares its own full tail — that mechanism is uniform repo-wide (#973) —
 * but they all share this prefix rather than repeating the entity specs by
 * hand.
 *
 * The two `entity` crumbs appear in the same left-to-right order as the
 * route's own `$tenantId`/`$profileId` segments, which the breadcrumb
 * contract's binding guard enforces.
 */
export const staffTenantProfileCrumbsBase = (
	params: Record<string, string>,
): readonly CrumbSpec[] => [
	{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
	{
		kind: 'entity',
		to: `/staff/tenants/${params.tenantId}`,
		query: staffTenantCrumbQuery,
		select: selectStaffTenantCrumbName,
	},
	{
		kind: 'label',
		labelKey: 'common:profiles',
		to: `/staff/tenants/${params.tenantId}/profiles`,
	},
	{
		kind: 'entity',
		to: `/staff/tenants/${params.tenantId}/profiles/${params.profileId}`,
		query: staffTenantProfileCrumbQuery,
		select: selectStaffTenantProfileCrumbName,
	},
];
