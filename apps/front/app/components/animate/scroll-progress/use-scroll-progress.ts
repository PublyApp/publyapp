import { useMemo, useRef } from 'react';

import { useScroll, type MotionValue } from 'framer-motion';

// ----------------------------------------------------------------------

export type UseScrollProgressReturn = {
	scrollXProgress: MotionValue<number>;
	scrollYProgress: MotionValue<number>;
	elementRef: React.RefObject<HTMLDivElement | null>;
};

export type UseScrollProgress = 'document' | 'container';

export const useScrollProgress = (target: UseScrollProgress = 'document'): UseScrollProgressReturn => {
	const elementRef = useRef<HTMLDivElement>(null);

	const options = { container: elementRef };

	const { scrollYProgress, scrollXProgress } = useScroll(target === 'container' ? options : undefined);

	const memoizedValue = useMemo(() => {
		return { elementRef, scrollXProgress, scrollYProgress };
	}, [elementRef, scrollXProgress, scrollYProgress]);

	return memoizedValue;
};
