import { Navigate, Outlet } from 'react-router-dom';

import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { useGetClientAuth } from '@/ui-react/lib/react-query/features/auth/auth.hooks';

const PublicOnly = () => {
	const {
		result: { data: authData },
	} = useGetClientAuth();

	if (!authData) {
		return <Outlet />;
	}

	return <Navigate to={BO_PATH_NAMES.dashboard.root} />;
};

export default PublicOnly;
