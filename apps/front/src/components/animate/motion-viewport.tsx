import Box, { type BoxProps } from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { type MotionProps, m } from 'framer-motion';

import { varContainer } from './variants';

// ----------------------------------------------------------------------

export type MotionViewportProps = BoxProps &
	MotionProps & {
		disableAnimate?: boolean;
	};

export const MotionViewport = ({
	children,
	viewport,
	disableAnimate = true,
	...other
}: MotionViewportProps) => {
	const smDown = useMediaQuery((theme) => {
		return theme.breakpoints.down('sm');
	});

	const disabled = smDown && disableAnimate;

	const baseProps = disabled
		? {}
		: {
				component: m.div,
				initial: 'initial',
				whileInView: 'animate',
				variants: varContainer(),
				viewport: { once: true, amount: 0.3, ...viewport },
			};

	return (
		<Box {...baseProps} {...other}>
			{children}
		</Box>
	);
};
