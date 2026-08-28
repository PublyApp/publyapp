import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { columnDisplayMeta } from './column-display-meta';
import type { ColumnDef } from './column-type';

/** Every distinct `hideBelow`/`pinWidthAbove` value a table's columns
 * declare — the only widths a resize can actually need to react to. */
export const collectDisplayBreakpoints = (
	columns: (ColumnDef<never> | { meta?: unknown })[],
): number[] => {
	const breakpoints = new Set<number>();
	for (const column of columns) {
		const meta = columnDisplayMeta(column);
		if (meta.hideBelow != null) {
			breakpoints.add(meta.hideBelow);
		}
		if (meta.pinWidthAbove != null) {
			breakpoints.add(meta.pinWidthAbove);
		}
	}
	return [...breakpoints].sort((left, right) => left - right);
};

const matchedBreakpointsKey = (breakpoints: number[]): string =>
	breakpoints
		.filter(
			(breakpoint) => window.matchMedia(`(min-width: ${breakpoint}px)`).matches,
		)
		.join(',');

/**
 * Subscribes to exactly the distinct breakpoints a table's columns declare,
 * not to every pixel of a window resize (r3-shell-F7 / r2-F10): the old
 * `useViewportWidth` snapshotted raw `window.innerWidth` off a `resize`
 * listener, so a full window drag produced a new number — and therefore a
 * new `columnVisibility` object and a new `useReactTable` state — at up to
 * ~60 Hz, re-rendering the entire table on every tick even though the only
 * thing that can actually change is which breakpoints are crossed. One
 * `matchMedia` listener per distinct breakpoint only fires on an actual
 * crossing.
 */
export const useMatchedBreakpoints = (
	breakpoints: number[],
): ReadonlySet<number> => {
	// `breakpoints` is a fresh array each render (derived from `columns` via
	// `useMemo`), so subscribe/getSnapshot key off its stable string identity
	// instead, to avoid resubscribing every render for the same set of values.
	const key = breakpoints.join(',');

	const subscribe = useCallback(
		(callback: () => void) => {
			// Each listener is paired with its own disposer as it is added, so the
			// cleanup path is a single `unsubscribe` the store returns verbatim.
			// Both callbacks re-derive the breakpoint values from `key` — the
			// array's stable identity — so the dep arrays stay complete and no
			// suppression is needed.
			const breakpoints = key.split(',').map(Number);
			const disposers = breakpoints.map((breakpoint) => {
				const mediaQueryList = window.matchMedia(
					`(min-width: ${breakpoint}px)`,
				);
				mediaQueryList.addEventListener('change', callback);
				return () => {
					mediaQueryList.removeEventListener('change', callback);
				};
			});
			const unsubscribe = () => {
				for (const dispose of disposers) {
					dispose();
				}
			};
			return unsubscribe;
		},
		[key],
	);
	const getSnapshot = useCallback(
		() => matchedBreakpointsKey(key.split(',').map(Number)),
		[key],
	);
	// SSR/first-paint: every breakpoint matches, so every `hideBelow` column
	// renders on the server and during hydration (desktop-first, same
	// convention as `useMediaQuery`'s `true` server snapshot) —
	// `useSyncExternalStore` reconciles to the real matches right after mount.
	const getServerSnapshot = useCallback(() => key, [key]);

	const matchedKey = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);

	return useMemo(
		() => new Set(matchedKey ? matchedKey.split(',').map(Number) : []),
		[matchedKey],
	);
};
