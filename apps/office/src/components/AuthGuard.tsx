import { useMemo, type ReactNode } from 'react';

import { Outlet } from 'react-router-dom';

import type { IRoleConfig } from '@/shared/lib/constants';

import useHasRoles from '../hooks/useHasRoles';

type Props = {
	children?: ReactNode;
	allowedRoles?: IRoleConfig[];
};

const RequireAuth = ({ children, allowedRoles }: Props) => {
	const hasRoles = useHasRoles();

	const hasRequiredRoles = useMemo(() => {
		return hasRoles({ allowedRoles });
	}, [allowedRoles, hasRoles]);

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
