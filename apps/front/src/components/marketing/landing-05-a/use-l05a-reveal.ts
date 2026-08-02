import { type RefObject, useEffect } from 'react';

/**
 * The page's below-the-fold reveal, and the constraints that shape it.
 *
 * The direction shipped two entrance animations at the very top of the page
 * and nothing at all below them, which is what makes a page feel
 * front-loaded — the craft appears to run out at the fold. This gives every
 * section the same arrival as the hero, once, as it comes into view.
 *
 * Three rules it has to satisfy at the same time:
 *
 * 1. SSR MUST STAY COMPLETE. Marketing surfaces are server-rendered and have
 *    to be meaningful before JavaScript runs, so the hidden state cannot be a
 *    CSS default — a `.section { opacity: 0 }` rule ships an invisible page to
 *    anyone whose JS has not executed. The hidden state is therefore only
 *    reachable through `data-l05a-reveal="idle"`, an attribute no server
 *    render emits and this hook adds on mount.
 *
 * 2. NOTHING ALREADY ON SCREEN MAY FLASH. On mount, anything whose top is
 *    already inside the viewport is marked `in` immediately and never passes
 *    through `idle`, so hydration cannot hide and re-show content the reader
 *    is looking at.
 *
 * 3. REDUCED MOTION IS A FIRST-CLASS PATH, NOT A CANCELLATION. Under
 *    `prefers-reduced-motion` the hook attributes nothing and observes
 *    nothing: there is no hidden state to restore and no animation to stop,
 *    because the page was already complete. That is the difference between a
 *    reduced-motion path and a reduced-motion patch.
 *
 * The observer disconnects after the last element has been revealed; the
 * reveal is one-way and never replays on scroll-up.
 */
export const useL05aReveal = (
	containerRef: RefObject<HTMLElement | null>,
): void => {
	useEffect(() => {
		const container = containerRef.current;
		if (container === null) {
			return;
		}

		const prefersReducedMotion = globalThis.matchMedia?.(
			'(prefers-reduced-motion: reduce)',
		).matches;
		if (prefersReducedMotion === true) {
			return;
		}

		const targets = Array.from(
			container.querySelectorAll<HTMLElement>('[data-l05a-reveal-target]'),
		);
		if (targets.length === 0 || typeof IntersectionObserver === 'undefined') {
			return;
		}

		const pending = new Set<HTMLElement>();
		for (const target of targets) {
			// Already on screen at hydration: attribute NOTHING. Marking it
			// `in` would apply the keyframe's `from` state for a frame and
			// flash content the reader is currently looking at; leaving it
			// unattributed means no reveal rule matches it at all and it stays
			// exactly as the server rendered it.
			if (target.getBoundingClientRect().top < globalThis.innerHeight) {
				continue;
			}

			target.dataset.l05aReveal = 'idle';
			pending.add(target);
		}

		if (pending.size === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) {
						continue;
					}

					const target = entry.target as HTMLElement;
					target.dataset.l05aReveal = 'in';
					observer.unobserve(target);
					pending.delete(target);
				}

				if (pending.size === 0) {
					observer.disconnect();
				}
			},
			// A section counts as arrived once its first 12% has entered the
			// viewport from below: early enough that the reveal is finished by
			// the time the reader's eye reaches the heading, late enough that
			// it is never triggered by a section that is only peeking.
			{ rootMargin: '0px 0px -12% 0px' },
		);

		for (const target of pending) {
			observer.observe(target);
		}

		return () => observer.disconnect();
	}, [containerRef]);
};
