import { Navigate /* , Outlet */ } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { useGetClientAuthSuspenseQuery } from '@/ui-react/lib/react-query/features/auth/auth.hooks';

const PublicOnly = () => {
	const {
		result: { /* data: authData, */ error },
	} = useGetClientAuthSuspenseQuery();

	if (error) {
		throw error;
	}

	return <Navigate to={BO_PATH_NAMES.dashboard.root} />;

	// if (!error && authData) {
	// 	return <Navigate to={BO_PATH_NAMES.dashboard.root} />;
	// }

	// return <Outlet />;
};

export default PublicOnly;
