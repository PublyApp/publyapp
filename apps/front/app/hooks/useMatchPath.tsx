import { useCallback } from 'react';

import { matchPath as routerMatchPath, useLocation } from 'react-router';

// ----------------------------------------------------------------------

type ReturnType = {
	active: boolean;
	isExternalLink: boolean;
};

const useMatchPath = () => {
	const { pathname } = useLocation();

	const matchPath = useCallback(
		(path: string, deep = true): ReturnType => {
			const normalActive = path ? !!routerMatchPath({ path, end: true }, pathname) : false;

			const deepActive = path ? !!routerMatchPath({ path, end: false }, pathname) : false;

			return {
				active: deep ? deepActive : normalActive,
				isExternalLink: path.includes('http'),
			};
		},
		[pathname],
	);

	return matchPath;
};

export default useMatchPath;
