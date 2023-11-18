import { forwardRef, useMemo } from 'react';

import { Link, useLocation, type LinkProps } from 'react-router-dom';

import usePathname from '@office/hooks/usePathName';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
	href: string;
	withQuery?: boolean;
}

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(({ href, withQuery = false, ...other }, ref) => {
	const { search } = useLocation();
	const pathname = usePathname();

	const url = useMemo(() => {
		if (!href.startsWith('http://') || !href.startsWith('https://')) {
			return new URL(window.location.origin + href);
		}

		return new URL(href);
	}, [href]);

	if (url.pathname === pathname) {
		if (!url.search) {
			return <Link ref={ref} to={href + search} {...other} />;
		}

		return <Link ref={ref} to={href} {...other} />;
	}

	if (!withQuery) {
		return <Link ref={ref} to={href} {...other} />;
	}

	return <Link ref={ref} to={href + search} {...other} />;
});

export default RouterLink;
