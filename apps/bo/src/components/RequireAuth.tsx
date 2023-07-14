import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@aktiveo/ui-react/hooks/useAuth';
import { BO_PATH_NAMES } from '@aktiveo/shared/utils/constants';
// type Props = {};

const RequireAuth = (/* props: Props */) => {
	const { isAuthed } = useAuth();
	const location = useLocation();

	if (!isAuthed) {
		return <Navigate replace state={{ from: location }} to={BO_PATH_NAMES.logIn} />;
	}

	return <Outlet />;
};

export default RequireAuth;
