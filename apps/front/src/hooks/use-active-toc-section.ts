import { useEffect, useRef, useState } from 'react';

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
 *
 * See also: `useScrollspy` (sibling hook). Different selection logic —
 * `useScrollspy` picks the section with the highest intersection ratio
 * (best for forms with sections of varying length where the user is
 * actively interacting with one). Prefer `useActiveTocSection` for
 * read-only long-scroll docs (legal, blog article, docs); prefer
 * `useScrollspy` for interactive multi-section forms.
 */
export const useActiveTocSection = ({
	ids,
	rootMargin = '-20% 0px -70% 0px',
}: UseActiveTocSectionOptions): string | null => {
	const [activeId, setActiveId] = useState<string | null>(null);
	const previousActiveRef = useRef<string | null>(null);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		if (ids.length === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const visibleSections = [] as Array<{
					id: string;
					boundingTop: number;
				}>;

				for (const entry of entries) {
					if (!entry.isIntersecting) {
						continue;
					}

					visibleSections.push({
						id: entry.target.id,
						boundingTop: entry.boundingClientRect.top,
					});
				}

				visibleSections.sort((a, b) => {
					return Math.abs(a.boundingTop) - Math.abs(b.boundingTop);
				});

				const nextActiveId =
					visibleSections.length > 0 ? visibleSections[0].id : null;

				if (nextActiveId !== previousActiveRef.current) {
					previousActiveRef.current = nextActiveId;
					setActiveId(nextActiveId);
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
			for (const el of elements) {
				observer.unobserve(el);
			}
			observer.disconnect();
		};
	}, [ids, rootMargin]);

	return ids.length === 0 || (activeId !== null && !ids.includes(activeId))
		? null
		: activeId;
};
