import { forwardRef } from 'react';

import { Icon, type IconifyIcon } from '@iconify/react';
import { Box, type BoxProps } from '@mui/material';

// ----------------------------------------------------------------------

export type IconifyProps = IconifyIcon | string;

interface Props extends BoxProps {
	icon: IconifyProps;
}

const Iconify = forwardRef<SVGElement, Props>(({ icon, width = 20, sx, ...other }, ref) => {
	return <Box ref={ref} component={Icon} icon={icon} sx={{ width, height: width, flexShrink: 0, ...sx }} {...other} />;
});

export default Iconify;
