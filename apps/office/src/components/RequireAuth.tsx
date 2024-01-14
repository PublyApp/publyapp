import type { ReactNode } from 'react';

import { /*  Navigate, */ Outlet /* , useLocation */ } from 'react-router-dom';

// import { BO_PATH_NAMES } from '@devist/shared/lib/constants';
import { useGetClientAuthSuspenseQuery } from '@devist/ui-react/lib/react-query/features/auth/auth.hooks';

type Props = {
	children?: ReactNode;
};

const RequireAuth = ({ children }: Props) => {
	// const location = useLocation();
	const {
		result: { /* data: authData */ error },
	} = useGetClientAuthSuspenseQuery();

	if (error) {
		// return null;
		throw error;
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
