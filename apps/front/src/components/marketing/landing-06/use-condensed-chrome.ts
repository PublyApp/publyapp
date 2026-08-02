import { useEffect, useState } from 'react';

const CONDENSE_AT = 72;
const EXPAND_AT = 40;

/**
 * Drives the header's shrinking-frame mechanic (PROMPT.md §2.2/§2.3): a
 * hysteresis band rather than a single threshold, so a page that settles at
 * exactly 72px of scroll cannot flicker between states. Coalesced through
 * one `requestAnimationFrame` and a passive listener — a non-passive scroll
 * handler on a landing page is a measurable jank source.
 *
 * All eight collapsing properties live in `landing-06.css` under
 * `[data-condensed='true']`; this hook only ever returns the boolean.
 */
export const useCondensedChrome = (): boolean => {
	const [condensed, setCondensed] = useState(false);

	useEffect(() => {
		let frame = 0;

		const read = () => {
			frame = 0;
			setCondensed((was) =>
				was ? window.scrollY >= EXPAND_AT : window.scrollY > CONDENSE_AT,
			);
		};

		const onScroll = () => {
			if (frame === 0) {
				frame = requestAnimationFrame(read);
			}
		};

		// Corrects a restored scroll position (e.g. back-navigation) on the
		// first client frame; SSR/hydration always start from the rest state.
		read();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll);
			cancelAnimationFrame(frame);
		};
	}, []);

	return condensed;
};
