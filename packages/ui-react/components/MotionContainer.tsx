import { Box, type BoxProps } from '@mui/material';
import { m, type MotionProps } from 'framer-motion';

import { varContainer } from './animate/variants/container';

// ----------------------------------------------------------------------

type IProps = BoxProps & MotionProps;

export type MotionContainerProps = IProps & {
	animate?: boolean;
	action?: boolean;
};

const MotionContainer = ({ animate, action = false, children, ...other }: MotionContainerProps) => {
	if (action) {
		return (
			<Box
				component={m.div}
				initial={false}
				animate={animate ? 'animate' : 'exit'}
				variants={varContainer()}
				{...other}
			>
				{children}
			</Box>
		);
	}

	return (
		<Box component={m.div} initial="initial" animate="animate" exit="exit" variants={varContainer()} {...other}>
			{children}
		</Box>
	);
};

export default MotionContainer;
