import type { Transition, Variants } from 'framer-motion';

// ----------------------------------------------------------------------

type Options = {
	transitionIn?: Transition;
	transitionOut?: Transition;
};

export const varContainer = (props?: Options): Variants => {
	return {
		animate: {
			transition: {
				staggerChildren: 0.05,
				delayChildren: 0.05,
				...props?.transitionIn,
			},
		},
		exit: {
			transition: {
				staggerChildren: 0.05,
				staggerDirection: -1,
				...props?.transitionOut,
			},
		},
	};
};
