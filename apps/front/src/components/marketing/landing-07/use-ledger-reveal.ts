import {
	type CSSProperties,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from 'react';

const REVEAL_ROOT_MARGIN = '0px 0px -12% 0px';
const REVEAL_THRESHOLD = 0.1;
// A row's cells cascade over at most 240ms (4 * 60ms) so no element is ever
// more than 240ms late (PROMPT.md §6.3).
const REVEAL_INDEX_CAP = 4;

export type LedgerRevealProps<T extends Element> = {
	ref: RefObject<T | null>;
	'data-reveal': true;
	'data-revealed': boolean;
	style: CSSProperties;
};

/**
 * Wires one element into the page's scroll-reveal system (PROMPT.md §6.3):
 * blur(1.5px) + opacity + 6px rise over 360ms, on the house curve. A single
 * `IntersectionObserver` per element sets `data-revealed` once and
 * unobserves — it never replays. `index` (capped at 4) staggers siblings
 * revealed by separate calls to this hook 60ms apart via
 * `--publy-reveal-index`, read by `[data-reveal]` in landing-07.css.
 *
 * Consume by spreading the return value onto the element that should
 * animate: `<div {...useLedgerReveal(index)}>`. The hidden initial state
 * lives entirely in CSS and is corrected for both `prefers-reduced-motion`
 * (restores the end state) and `@media (scripting: none)` (no observer runs
 * without JavaScript), so `revealed` starting `false` here never ships
 * content that stays invisible.
 */
export function useLedgerReveal<T extends Element>(
	index = 0,
): LedgerRevealProps<T> {
	const ref = useRef<T | null>(null);
	const [revealed, setRevealed] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node) {
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					setRevealed(true);
					observer.disconnect();
				}
			},
			{ rootMargin: REVEAL_ROOT_MARGIN, threshold: REVEAL_THRESHOLD },
		);
		observer.observe(node);

		return () => observer.disconnect();
	}, []);

	return {
		ref,
		'data-reveal': true,
		'data-revealed': revealed,
		style: {
			'--publy-reveal-index': Math.min(index, REVEAL_INDEX_CAP),
		} as CSSProperties,
	};
}
