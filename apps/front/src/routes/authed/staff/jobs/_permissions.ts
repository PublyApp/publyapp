import { useQuery } from '@tanstack/react-query';
import { staffJobPermissionsQueryOptions } from '~/lib/query/staff-jobs';

export type StaffJobPermissions = {
	isPending: boolean;
	loadError: boolean;
	canView: boolean;
	canRequeue: boolean;
	canUpdateSystemJob: boolean;
	canTriggerSystemJob: boolean;
};

/** Derives per-action gating from the caller's EFFECTIVE permission payload.
 * `GET /auth/scope-auth-data?scope=staff` flattens the staff user's role
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

	// Mirror the API-side PermissionFilter semantics: a full-access staff
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
