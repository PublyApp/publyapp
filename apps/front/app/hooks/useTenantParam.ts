import _ from 'lodash';

import { useLocation, useParams } from 'react-router';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { getLastPath, makePath } from '@/shared/utils/string.utils';

export const useTenantParam = () => {
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

	return tenantId;
};
