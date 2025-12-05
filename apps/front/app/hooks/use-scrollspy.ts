import { useEffect, useRef, useState } from 'react';

export interface UseScrollspyOptions {
	sectionIds: string[];
	offset?: number;
	rootMargin?: string;
}

export const useScrollspy = ({
	sectionIds,
	offset = 100,
	rootMargin = '0px',
}: UseScrollspyOptions) => {
	const [activeSection, setActiveSection] = useState<string | null>(null);
	const previousActiveRef = useRef<string | null>(null);

	useEffect(() => {
		// Early return if no sections to observe
		if (sectionIds.length === 0) {
			setActiveSection(null);
			return;
		}

		const observerOptions: IntersectionObserverInit = {
			rootMargin: `-${offset}px 0px ${rootMargin}`,
			threshold: [0, 0.25, 0.5, 0.75, 1],
		};

		const observer = new IntersectionObserver((entries) => {
			// Find the section that is most visible
			const visibleSections = entries
				.filter((entry) => entry.isIntersecting)
				.map((entry) => {
					return {
						id: entry.target.id,
						intersectionRatio: entry.intersectionRatio,
						boundingTop: entry.boundingClientRect.top,
					};
				})
				.sort((a, b) => {
					// Prefer sections with higher intersection ratio
					if (Math.abs(a.intersectionRatio - b.intersectionRatio) > 0.1) {
						return b.intersectionRatio - a.intersectionRatio;
					}
					// If ratios are similar, prefer the one closer to the top
					return Math.abs(a.boundingTop) - Math.abs(b.boundingTop);
				});

			const newActiveSection =
				visibleSections.length > 0 ? visibleSections[0].id : null;

			// Only update state if the active section actually changed
			if (newActiveSection !== previousActiveRef.current) {
				previousActiveRef.current = newActiveSection;
				setActiveSection(newActiveSection);
			}
		}, observerOptions);

		// Observe all sections
		const elements = sectionIds
			.map((id) => {
				return document.getElementById(id);
			})
			.filter((el): el is HTMLElement => el !== null);

		elements.forEach((el) => {
			observer.observe(el);
		});

		return () => {
			elements.forEach((el) => {
				observer.unobserve(el);
			});
			observer.disconnect();
		};
	}, [sectionIds, offset, rootMargin]);

	return activeSection;
};
