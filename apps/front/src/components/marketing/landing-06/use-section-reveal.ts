import { useEffect, useRef } from 'react';

/**
 * The house entrance, attached per tier section (PROMPT.md §13.2/§13.4): each
 * section fades and rises into place once, as one unit, when it crosses the
 * viewport — never per element, never more than once.
 *
 * The pre-reveal ("pending") state is applied directly to the DOM node from
 * this effect, never baked into the server-rendered className. That is the
 * binding requirement in §13.4: a visitor without JavaScript, or one who
 * hasn't finished hydrating yet, must see a fully visible, meaningful page —
 * a landing page that is blank without JavaScript is a failure. Because the
 * class is added imperatively (not through a render-time class string), there
 * is also no hydration mismatch to reconcile.
 *
 * `prefers-reduced-motion` opts a visitor out of the animation entirely by
 * skipping the pending/observe step altogether, rather than relying solely on
 * app.css's blanket 1ms transition-collapse to hide it — that collapse still
 * leaves a genuine (if 1ms) opacity dip, which this avoids outright.
 */
export const useSectionReveal = <T extends HTMLElement>() => {
	const ref = useRef<T>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) {
			return;
		}

		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}

		element.classList.add('publy-landing-06-reveal-pending');

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry || !entry.isIntersecting) {
					return;
				}
				element.classList.remove('publy-landing-06-reveal-pending');
				element.classList.add('publy-landing-06-reveal');
				observer.disconnect();
			},
			{ threshold: 0.15 },
		);

		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return ref;
};
