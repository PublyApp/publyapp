import React from 'react';

import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom';

const Link = React.forwardRef<HTMLAnchorElement, RouterLinkProps>((itemProps, ref) => {
	return <RouterLink ref={ref} {...itemProps} role={undefined} />;
});

export default Link;
