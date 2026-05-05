import { domMax, LazyMotion } from 'framer-motion';

// ----------------------------------------------------------------------

export type MotionLazyProps = {
	children: React.ReactNode;
};

export const MotionLazy = ({ children }: MotionLazyProps) => {
	return (
		<LazyMotion strict features={domMax}>
			{children}
		</LazyMotion>
	);
};
