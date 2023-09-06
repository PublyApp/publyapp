import { redirect } from 'next/navigation';

import Login from '../../containers/logIn/Login';
import { getServerAuth } from '../../utils/parseAuth';

const LogIn = async () => {
	const auth = await getServerAuth();

	if (auth) {
		redirect('/');
	}

	return <Login />;
};

export default LogIn;
