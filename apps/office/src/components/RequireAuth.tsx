import type { ReactNode } from 'react';

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { BO_PATH_NAMES } from '@devist/shared/utils/constants';
import { useGetClientAuth } from '@devist/ui-react/query/features/auth/auth.hooks';

type Props = {
	children?: ReactNode;
};

const RequireAuth = ({ children }: Props) => {
	const location = useLocation();
	const {
		result: { data: authData, isLoading },
	} = useGetClientAuth();

	if (isLoading) {
		return <h1>Verifying your rights...</h1>;
	}

	if (!authData) {
		return <Navigate replace state={{ from: location }} to={BO_PATH_NAMES.logIn} />;
	}

	return children ?? <Outlet />;
};

export default RequireAuth;
