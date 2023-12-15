import { matchPath, useLocation } from '@remix-run/react';

// ----------------------------------------------------------------------

type ReturnType = {
	active: boolean;
	isExternalLink: boolean;
};

const useActiveLink = (path: string, deep = true): ReturnType => {
	const { pathname } = useLocation();

	const normalActive = path ? !!matchPath({ path, end: true }, pathname) : false;

	const deepActive = path ? !!matchPath({ path, end: false }, pathname) : false;

	return {
		active: deep ? deepActive : normalActive,
		isExternalLink: path.includes('http'),
	};
};

export default useActiveLink;
