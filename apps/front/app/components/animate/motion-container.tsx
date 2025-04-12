import Box, { type BoxProps } from "@mui/material/Box";
import { m, type MotionProps } from "framer-motion";

import { varContainer } from "./variants";

// ----------------------------------------------------------------------

export type MotionContainerProps = BoxProps &
	MotionProps & {
		animate?: boolean;
		action?: boolean;
	};

export const MotionContainer = ({
	sx,
	animate,
	children,
	action = false,
	...other
}: MotionContainerProps) => {
	let animateProp: string;

	if (animate && action) {
		animateProp = "animate";
	} else if (action) {
		animateProp = "exit";
	} else {
		animateProp = "animate";
	}

	return (
		<Box
			component={m.div}
			variants={varContainer()}
			initial={action ? false : "initial"}
			animate={animateProp}
			exit={action ? undefined : "exit"}
			sx={sx}
			{...other}
		>
			{children}
		</Box>
	);
};
