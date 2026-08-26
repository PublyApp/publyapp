import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type { GetScopeAuthDataTenant } from '@org/client-ts/models/index';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

export type StaffJobPermissions = {
	isPending: boolean;
	loadError: boolean;
	canView: boolean;
	canRequeue: boolean;
	canUpdateSystemJob: boolean;
	canTriggerSystemJob: boolean;
};

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation/removal key from this. */
const STAFF_JOB_PERMISSIONS_QUERY_KEY = ['staff-jobs', 'permissions'];

const staffJobPermissionsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetScopeAuthDataTenant,
	Record<string, never>
>(
	{
		queryKeyFn: () => [...STAFF_JOB_PERMISSIONS_QUERY_KEY],
		fetcher: async (client) => {
			const result = await client.auth.scopeAuthData.get({
				queryParameters: { scope: 'staff' },
			});

			if (!result) {
				throw new Error('scope auth data result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

/** Derives per-action gating from the caller's EFFECTIVE permission payload.
 * `GET /auth/scope-auth-data?scope=staff` flattens the staff user's profile
 * grants into `permissions`. The permission-CATALOG endpoint
 * (`/staff/permissions/scopes/staff`) deliberately lists every definable key
 * for any staff session — never gate UI on it. Kiota models the union
 * response as `GetScopeAuthDataTenant`; the staff shape round-trips through
 * it, and the defensive `code === 'staff'` check keeps a stray tenant payload
 * from granting anything. */
export const useStaffJobPermissions = (): StaffJobPermissions => {
	const query = useQuery({
		queryKey: staffJobPermissionsQueryOptions.queryKey({}),
		queryFn: () => staffJobPermissionsQueryOptions.fetcher({}),
	});

	// Mirror the API-side PermissionFilter semantics: an Admin-level staff
	// account bypasses per-key checks entirely, so its (often empty) grants
	// list must not produce a dead UI — every action stays available.
	const data = query.data;
	const isStaff = data?.code === 'staff';
	const isAdmin = isStaff && data?.isAdmin === true;
	const permissions = isStaff ? (data.permissions ?? []) : [];

	return {
		isPending: query.isPending,
		loadError: query.isError,
		canView: isAdmin || permissions.includes('staff.jobs.view'),
		canRequeue: isAdmin || permissions.includes('staff.jobs.requeue'),
		canUpdateSystemJob:
			isAdmin || permissions.includes('staff.jobs.system_job_update'),
		canTriggerSystemJob:
			isAdmin || permissions.includes('staff.jobs.system_job_trigger'),
	};
};
