import { useContext } from 'react';

import { AppContext } from '../contexts/AppProvider';

export const useApp = () => {
	return useContext(AppContext);
};
