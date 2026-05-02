import { useEffect, useState } from 'react';

// ----------------------------------------------------------------------

type UseActiveTocSectionOptions = {
	ids: string[];
	rootMargin?: string;
};

/**
 * Tracks which heading is "currently active" while scrolling through a
 * long document. Returns the id of the most recently entered heading.
 *
 * Default rootMargin '-20% 0px -70% 0px' defines the active band as the
 * top 30% of the viewport — a heading becomes active when it enters that
 * band, which feels right for long-scroll docs (the heading you're
 * currently reading is near the top of where your eyes are).
 *
 * SSR-safe: bails out when window is undefined.
 */
export const useActiveTocSection = ({
	ids,
	rootMargin = '-20% 0px -70% 0px',
}: UseActiveTocSectionOptions): string | null => {
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		if (ids.length === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((entry) => {
					return entry.isIntersecting;
				});

				if (visible.length > 0) {
					setActiveId(visible[0].target.id);
				}
			},
			{ rootMargin, threshold: 0 },
		);

		const elements = ids
			.map((id) => {
				return document.getElementById(id);
			})
			.filter((el): el is HTMLElement => {
				return el !== null;
			});

		for (const el of elements) {
			observer.observe(el);
		}

		return () => {
			return observer.disconnect();
		};
	}, [ids, rootMargin]);

	return activeId;
};
