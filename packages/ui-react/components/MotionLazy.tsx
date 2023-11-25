'use client';

import { domMax, LazyMotion, m } from 'framer-motion';

// ----------------------------------------------------------------------

type Props = {
	children: React.ReactNode;
};

const MotionLazy = ({ children }: Props) => {
	return (
		<LazyMotion strict features={domMax}>
			<m.div style={{ height: '100%' }}>{children}</m.div>
		</LazyMotion>
	);
};

export default MotionLazy;
