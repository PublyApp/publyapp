import { useMemo } from 'react';

import { useLocation } from 'react-router-dom';

const usePathname = () => {
	const { pathname } = useLocation();

	return useMemo(() => {
		return pathname;
	}, [pathname]);
};

export default usePathname;
