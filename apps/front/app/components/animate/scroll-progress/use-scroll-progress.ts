import { type MotionValue, useScroll } from 'framer-motion';
import { useMemo, useRef } from 'react';

// ----------------------------------------------------------------------

export type UseScrollProgressReturn = {
	scrollXProgress: MotionValue<number>;
	scrollYProgress: MotionValue<number>;
	elementRef: React.RefObject<HTMLDivElement | null>;
};

export type UseScrollProgress = 'document' | 'container';

export const useScrollProgress = (
	target: UseScrollProgress = 'document',
): UseScrollProgressReturn => {
	const elementRef = useRef<HTMLDivElement>(null);

	const options = { container: elementRef };

	const { scrollYProgress, scrollXProgress } = useScroll(
		target === 'container' ? options : undefined,
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: code from template leave as is for now
	const memoizedValue = useMemo(() => {
		return { elementRef, scrollXProgress, scrollYProgress };
	}, [elementRef, scrollXProgress, scrollYProgress]);

	return memoizedValue;
};
