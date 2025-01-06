import { useSuspenseQuery } from '@tanstack/react-query';
import _ from 'lodash';
import { useLocation, useParams } from 'react-router';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { getLastPath, makePath } from '@/shared/utils/string.utils';

import { getTenantAuthDataQuery, getUserAuthDataQuery } from './auth.actions';

// ---- 1 --------------------------------------------------------------------------------

type UseGetUserAuthDataProps = {
	options?: Omit<ReturnType<typeof getUserAuthDataQuery>, 'queryKey' | 'queryFn'>;
};

export const useGetUserAuthData = ({ options }: UseGetUserAuthDataProps = {}) => {
	const query = getUserAuthDataQuery();

	const result = useSuspenseQuery({
		...query,
		...options,
	});

	return { result, key: query.queryKey };
};

// ---- 2 --------------------------------------------------------------------------------

type UseGetTenantAuthDataProps = {
	options?: Omit<ReturnType<typeof getTenantAuthDataQuery>, 'queryKey' | 'queryFn'>;
};

export const useGetTenantAuthData = ({ options }: UseGetTenantAuthDataProps = {}) => {
	const location = useLocation();
	const isStaffRoute = location.pathname.startsWith(makePath(getLastPath(FRONT_PATH_NAMES.staff.root)));
	const isTenantRoute = location.pathname.startsWith(makePath(getLastPath(FRONT_PATH_NAMES.tenant().root)));
	const params = useParams();

	let tenantId = '';

	if (isStaffRoute) {
		tenantId = 'staff';
	} else if (isTenantRoute) {
		const tenantIdPathParam = _.get(params, 'tenantId');

		if (tenantIdPathParam) {
			tenantId = tenantIdPathParam;
		}
	}

	const query = getTenantAuthDataQuery({ tenantId });

	const result = useSuspenseQuery({
		...query,
		...options,
	});

	return { result, key: query.queryKey };
};
