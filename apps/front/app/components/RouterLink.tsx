import { forwardRef } from 'react';

import { Link, useLocation, type LinkProps } from '@remix-run/react';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
	href: string;
	preserveQuery?: boolean;
}

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(({ href, preserveQuery = false, ...other }, ref) => {
	const { search } = useLocation();

	return <Link ref={ref} to={href + (preserveQuery ? search : '')} {...other} />;

	// const [searchParams] = useSearchParams();
	// const search = `?${decodeURIComponent(searchParams.toString())}`;
	// console.log('###', search);

	// const pathname = usePathname();

	// const url = useMemo(() => {
	// 	if (!href.startsWith('http://') || !href.startsWith('https://')) {
	// 		return new URL(window.location.origin + href);
	// 	}

	// 	return new URL(href);
	// }, [href]);

	// if (url.pathname === pathname) {
	// 	if (!url.search) {
	// 		return <Link ref={ref} to={href + search} {...other} />;
	// 	}

	// 	return <Link ref={ref} to={href} {...other} />;
	// }

	// if (!withQuery) {
	// 	return <Link ref={ref} to={href} {...other} />;
	// }
});

export default RouterLink;
