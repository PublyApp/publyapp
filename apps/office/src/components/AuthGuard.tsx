import { useMemo, type ReactNode } from 'react';

import { /*  Navigate, */ Outlet /* , useLocation */ } from 'react-router-dom';

// import { BO_PATH_NAMES } from '@devist/shared/lib/constants';
import { useGetClientAuthSuspenseQuery } from '@devist/ui-react/lib/react-query/features/auth/auth.hooks';

import type { IRoleConfig } from '@/shared/lib/constants';

type Props = {
	children?: ReactNode;
	allowedRoles?: IRoleConfig[];
};

const RequireAuth = ({ children, allowedRoles }: Props) => {
	// const location = useLocation();
	const {
		result: { data: authData, error },
	} = useGetClientAuthSuspenseQuery();

	if (error) {
		// return null;
		throw error;
	}

	const hasRequiredRoles = useMemo(() => {
		if (!allowedRoles) {
			return true;
		}

		return authData.roles.some((role) => {
			return allowedRoles.some((allowedRole) => {
				return allowedRole.code === role.code;
			});
		});
	}, [allowedRoles, authData.roles]);

	if (!hasRequiredRoles) {
		return <h1>Page 403: not allowed (todo: better look)</h1>;
	}

	return children ?? <Outlet />;

	// if (isLoading) {
	// 	return <h1>Verifying your rights...</h1>;
	// }

	// if (!authData) {
	// 	return <Navigate replace state={{ from: location }} to={BO_PATH_NAMES.auth.login} />;
	// }

	// return children ?? <Outlet />;
};

export default RequireAuth;
