import { useEffect, useState } from 'react';

/**
 * Drives the product-tour rail's active state (PROMPT.md §6.2): `aria-current`
 * and the moving 2px indicator both follow whichever scene owns the
 * viewport's middle band, via a `-45% / -45%` root margin so the boundary
 * fires when a scene crosses the vertical centre rather than its edge — the
 * same mechanic as `useCondensedChrome`, coalesced through the browser's own
 * observer rather than a scroll listener.
 */
export const useTourRailActiveIndex = (sceneIds: readonly string[]): number => {
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		const elements: HTMLElement[] = [];
		for (const id of sceneIds) {
			const element = document.getElementById(id);
			if (element) {
				elements.push(element);
			}
		}

		if (elements.length === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				let topmost: IntersectionObserverEntry | null = null;

				for (const entry of entries) {
					if (!entry.isIntersecting) {
						continue;
					}
					if (
						topmost === null ||
						entry.boundingClientRect.top < topmost.boundingClientRect.top
					) {
						topmost = entry;
					}
				}

				if (topmost === null) {
					return;
				}

				const index = sceneIds.indexOf(topmost.target.id);
				if (index !== -1) {
					setActiveIndex(index);
				}
			},
			{ rootMargin: '-45% 0px -45% 0px', threshold: 0 },
		);

		for (const element of elements) {
			observer.observe(element);
		}

		return () => observer.disconnect();
	}, [sceneIds]);

	return activeIndex;
};
