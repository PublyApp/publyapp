import { useQuery } from '@tanstack/react-query';
import { staffJobPermissionsQueryOptions } from '~/lib/query/staff-jobs';

/** The assign drawer needs BOTH permissions: `roles.update_for_staff` to call
 * the assign endpoint and `users.list_for_staff` to list the candidates, so the
 * action is hidden unless the caller holds both. Reads the caller's EFFECTIVE
 * grants (`GET /auth/scope-auth-data?scope=staff`, the same entry the jobs
 * pages gate on); a full-access account bypasses per-key checks like the API's
 * PermissionFilter does. Never gate on the permission catalog endpoint. */
const ASSIGN_PERMISSIONS = [
	'staff.roles.update_for_staff',
	'staff.users.list_for_staff',
] as const;

export const useCanAssignStaffRoleMembers = (): boolean => {
	const query = useQuery({
		queryKey: staffJobPermissionsQueryOptions.queryKey({}),
		queryFn: () => staffJobPermissionsQueryOptions.fetcher({}),
	});

	const data = query.data;
	if (data?.code !== 'staff') {
		return false;
	}
	if (data.isAdmin === true) {
		return true;
	}
	const granted = data.permissions ?? [];
	return ASSIGN_PERMISSIONS.every((key) => granted.includes(key));
};
