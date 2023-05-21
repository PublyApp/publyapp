import { useContext } from 'react';

import { AuthContext } from '../contexts/auth/AuthProvider';

export const useAuth = () => {
	return useContext(AuthContext);
};
