import { useEffect, useState } from 'react';

/**
 * Where a surface is in its life: `closed` (unmounted), `enter` (mounted with
 * its starting style, one frame), `open`, `exit` (still mounted while its
 * exit animation runs). Ported from Shopkart OS `lib/use-presence.ts` — front
 * has no equivalent.
 */
export type PresenceState = 'closed' | 'enter' | 'open' | 'exit';

const AFTER_OPEN = {
	closed: 'enter',
	enter: 'enter',
	open: 'open',
	exit: 'open',
} satisfies Record<PresenceState, PresenceState>;
const AFTER_CLOSE = {
	closed: 'closed',
	enter: 'exit',
	open: 'exit',
	exit: 'exit',
} satisfies Record<PresenceState, PresenceState>;
const SETTLED = {
	closed: 'closed',
	enter: 'open',
	open: 'open',
	exit: 'closed',
} satisfies Record<PresenceState, PresenceState>;

/** The state once `open` changes: reopening during the exit goes back to `open`. */
const presenceOnToggle = (state: PresenceState, open: boolean): PresenceState =>
	(open ? AFTER_OPEN : AFTER_CLOSE)[state];

/** The state once the current step is over: starting style painted, or exit done. */
const presenceSettled = (state: PresenceState): PresenceState => SETTLED[state];

/** How long the node stays mounted after `open` turns false. */
export const exitDelay = (ms: number, reducedMotion: boolean): number =>
	reducedMotion ? 0 : ms;

/** Whether the user asked for reduced motion (browser only). */
export const prefersReducedMotion = (): boolean =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A staggered entrance starting from the item nearest the trigger. */
export const staggerFromEnd = (
	index: number,
	count: number,
	step: number,
): number => (count - 1 - index) * step;

/**
 * Keeps a non-base-ui surface mounted during its exit animation. Render while
 * `mounted`; style from `state`, with a CSS transition between the starting
 * look (`enter`/`exit`) and the open one (`open`). `ms` = the exit duration.
 */
export const usePresence = (open: boolean, ms: number) => {
	const [state, setState] = useState<PresenceState>(open ? 'open' : 'closed');
	// Adjusting state while rendering (React's pattern for a prop change).
	const [seenOpen, setSeenOpen] = useState(open);
	if (seenOpen !== open) {
		setSeenOpen(open);
		setState(presenceOnToggle(state, open));
	}
	useEffect(() => {
		if (state === 'enter') {
			// Two frames: the first paints the starting style, the second lets
			// the transition run from it.
			let inner = 0;
			const outer = requestAnimationFrame(() => {
				inner = requestAnimationFrame(() => setState(presenceSettled));
			});
			return () => {
				cancelAnimationFrame(outer);
				cancelAnimationFrame(inner);
			};
		}
		if (state === 'exit') {
			const timer = window.setTimeout(
				() => setState(presenceSettled),
				exitDelay(ms, prefersReducedMotion()),
			);
			return () => window.clearTimeout(timer);
		}
		return undefined;
	}, [state, ms]);
	return { mounted: state !== 'closed', state };
};

// `html[data-scroll-locked]` hides the page and `.app-shell-main` overflow.
let holders = 0;
const setLocked = (locked: boolean): void => {
	if (typeof document === 'undefined') {
		return;
	}
	document.documentElement.toggleAttribute('data-scroll-locked', locked);
};

/**
 * Locks the page's scroll while `open`, for overlays that are not a base-ui
 * Dialog (the speed-dial). A base-ui Dialog already locks its own scroll, so
 * never add this to one. Shared by any number of holders.
 */
export const useScrollLock = (open: boolean): void => {
	useEffect(() => {
		if (!open) {
			return undefined;
		}
		holders += 1;
		if (holders === 1) {
			setLocked(true);
		}
		return () => {
			holders -= 1;
			if (holders === 0) {
				setLocked(false);
			}
		};
	}, [open]);
};
