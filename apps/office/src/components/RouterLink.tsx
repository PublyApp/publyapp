import { forwardRef } from 'react';

import { Link, type LinkProps } from 'react-router-dom';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
	href: string;
}

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(({ href, ...other }, ref) => {
	return <Link ref={ref} to={href} {...other} />;
});

export default RouterLink;
