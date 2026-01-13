import { type RefObject, useEffect, useRef, useState } from 'react';

export interface UseScrollPositionOptions {
	targetRef: RefObject<HTMLElement | Document>;
}

export const useScrollPosition = ({
	targetRef,
}: UseScrollPositionOptions): number => {
	const [scrollPosition, setScrollPosition] = useState(0);
	const rafIdRef = useRef<number | null>(null);
	const previousPositionRef = useRef<number>(0);

	useEffect(() => {
		const target = targetRef.current;
		if (!target) {
			return;
		}

		const getScrollPosition = (): number => {
			if (target === document) {
				return window.scrollY || window.pageYOffset;
			}
			if (target instanceof HTMLElement) {
				return target.scrollTop;
			}
			return 0;
		};

		const updateScrollPosition = () => {
			// Cancel any pending RAF
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
			}

			// Use requestAnimationFrame to sync with browser repaints
			rafIdRef.current = requestAnimationFrame(() => {
				const newPosition = getScrollPosition();

				// Only update state if the position actually changed
				if (newPosition !== previousPositionRef.current) {
					previousPositionRef.current = newPosition;
					setScrollPosition(newPosition);
				}

				rafIdRef.current = null;
			});
		};

		// Initial value
		const initialPosition = getScrollPosition();
		previousPositionRef.current = initialPosition;
		setScrollPosition(initialPosition);

		// Add event listener
		if (target === document) {
			window.addEventListener('scroll', updateScrollPosition, {
				passive: true,
			});
		} else if (target instanceof HTMLElement) {
			target.addEventListener('scroll', updateScrollPosition, {
				passive: true,
			});
		}

		return () => {
			// Cancel any pending RAF
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
			}

			if (target === document) {
				window.removeEventListener('scroll', updateScrollPosition);
			} else if (target instanceof HTMLElement) {
				target.removeEventListener('scroll', updateScrollPosition);
			}
		};
	}, [targetRef]);

	return scrollPosition;
};
