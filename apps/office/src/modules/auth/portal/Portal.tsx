import parseApi from 'packages/api/parse/ParseApi';
import { defer, Navigate, redirect } from 'react-router-dom';

import useHasRoles from '@/office/hooks/useHasRoles';
import { getRouteLoader } from '@/office/routes/utils';
import { BO_PATH_NAMES, LAST_USED_TENANT_ID_STORAGE_KEY, roleEnum, roleSet } from '@/shared/lib/constants';
import { getUserAuthDataQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import { useGetClientAuthSuspenseQuery } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';
import { localStorageGetItem } from '@/ui-react/utils/storage.utils';

const Portal = () => {
	const hasRoles = useHasRoles();

	const storedTenantId = localStorageGetItem(LAST_USED_TENANT_ID_STORAGE_KEY);
	const {
		result: { data: authData },
	} = useGetClientAuthSuspenseQuery({ params: { tenantId: storedTenantId } });

	const tenantRoles = [
		roleEnum.TENANT_ADMIN,
		roleEnum.TENANT_EDITOR,
		roleEnum.TENANT_USER,
		roleEnum.TENANT_CONTRIBUTOR,
	];

	const isStaffMember = hasRoles({ allowedRoles: roleSet.ABOVE_STAFF_CONTRIBUTOR });
	const isTenantMember = hasRoles({ allowedRoles: tenantRoles });

	// case 0: worst case neither staff of tenant member
	if (!isStaffMember && !isTenantMember) {
		// TODO: logout then go to login page
		return <h1>MEGA FORBIDDEN!!</h1>;
	}

	const tenantId = authData.tenant?.objectId;
	const tenantPaths = BO_PATH_NAMES.getTenantPaths(tenantId);

	if (isStaffMember) {
		//
		if (!isTenantMember) {
			return <Navigate to={BO_PATH_NAMES.staff.root} />;
		}

		if (!tenantId) {
			return <Navigate to={BO_PATH_NAMES.staff.root} />;
		}

		return <Navigate to={tenantPaths.root} />;
	}

	if (!tenantId) {
		// TODO: improve page UI
		return <Navigate to={tenantPaths.chose} />;
	}

	return <Navigate to={tenantPaths.root} />;

	// console.log(isStaffMember, isTenantMember);
	// case 1: is staff, and does not use any tenantId currently
	// if (roleSet.ABOVE_STAFF_CONTRIBUTOR && !authData.tenant?.objectId) {
	// 	return <Navigate to={BO_PATH_NAMES.staff.root} />
	// }

	// if (roleSet.ABOVE_STAFF_CONTRIBUTOR && authData.)

	// return null;

	// return <div>Portal</div>;
};

export default Portal;

Portal.loader = getRouteLoader(async () => {
	const sessionToken = parseApi.parseRestClient.getSessionToken();

	if (!sessionToken) {
		return redirect(BO_PATH_NAMES.auth.login);
	}

	const lastUsedTenantId = localStorageGetItem(LAST_USED_TENANT_ID_STORAGE_KEY);

	const authDataQuery = getUserAuthDataQuery({ tenantId: lastUsedTenantId });
	const cachedAuthData = defaultQueryClient.getQueryData(authDataQuery.queryKey);

	const authData = cachedAuthData ? Promise.resolve(cachedAuthData) : defaultQueryClient.fetchQuery(authDataQuery);

	return defer({
		authData,
	});
});
