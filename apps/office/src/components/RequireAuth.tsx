import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { BO_PATH_NAMES } from '@aktiveo/shared/utils/constants';
import { useGetClientAuth } from '@aktiveo/ui-react/query/features/auth/auth.hooks';

const RequireAuth = (/* props: Props */) => {
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

	return <Outlet />;
};

export default RequireAuth;
