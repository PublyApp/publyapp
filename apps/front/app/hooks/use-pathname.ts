import { useMemo } from 'react';

import { useLocation } from 'react-router';

// ----------------------------------------------------------------------

export const usePathname = () => {
	const { pathname } = useLocation();

	return useMemo(() => {
		return pathname;
	}, [pathname]);
};
