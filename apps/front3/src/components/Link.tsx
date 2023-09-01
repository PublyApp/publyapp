import React from 'react';

import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom';

const Link = React.forwardRef<HTMLAnchorElement, RouterLinkProps>((itemProps, ref) => {
	return <RouterLink ref={ref} {...itemProps} role={undefined} />;
});

export default Link;

// import React from 'react';

// import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom';
// import MuiLink, { LinkProps as MuiLinkProps } from '@mui/material';

// export type LinkProps = MuiLinkProps & Pick<RouterLinkProps, 'to' | 'replace'>;

// const createLink: React.FC<LinkProps> = ({ innerRef, ...rest }) => {
// 	return <RouterLink {...rest} />;
// };

// const Link: React.FC<LinkProps> = (props) => {
// 	return <MuiLink {...props} component={createLink} />;
// };

// export default Link;
