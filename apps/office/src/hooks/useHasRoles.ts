import { useCallback } from 'react';

import type { IRoleConfig } from '@/shared/lib/constants';
import { useGetClientAuthSuspenseQuery } from '@/ui-react/lib/react-query/features/auth/auth.hooks';

const useHasRoles = () => {
	const {
		result: { data: authData, error },
	} = useGetClientAuthSuspenseQuery();

	if (error) {
		throw error;
	}

	const hasRoles = useCallback(
		({ allowedRoles }: { allowedRoles?: IRoleConfig[] }) => {
			if (!allowedRoles) {
				return true;
			}

			return authData.roles.some((role) => {
				return allowedRoles.some((allowedRole) => {
					return allowedRole.code === role.code;
				});
			});
		},
		[authData.roles],
	);

	return hasRoles;
};

export default useHasRoles;
