import { forwardRef } from 'react';

import Link, { type LinkProps } from 'next/link';

// ----------------------------------------------------------------------

const RouterLink = forwardRef<HTMLAnchorElement, LinkProps>(({ ...other }, ref) => {
	return <Link ref={ref} {...other} />;
});

export default RouterLink;
