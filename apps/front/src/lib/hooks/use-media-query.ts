import { useCallback, useSyncExternalStore } from 'react';

const subscribe = (query: string, callback: () => void): (() => void) => {
	const mql = window.matchMedia(query);
	mql.addEventListener('change', callback);
	return () => mql.removeEventListener('change', callback);
};

/**
 * SSR snapshot is always `true` so the server renders the desktop layout;
 * a narrow client hydrates from the same markup and then reconciles once
 * `useSyncExternalStore` reads the real match on mount.
 */
export const useMediaQuery = (query: string): boolean => {
	// `subscribe`/`getSnapshot` must be stable across renders: React tears
	// down and re-adds the `matchMedia` listener whenever `subscribe`'s
	// identity changes, so an inline arrow here resubscribes on every
	// render (route change, sidebar toggle, ...) instead of only when
	// `query` changes.
	const subscribeToQuery = useCallback(
		(callback: () => void) => subscribe(query, callback),
		[query],
	);
	const getSnapshot = useCallback(
		() => window.matchMedia(query).matches,
		[query],
	);
	const getServerSnapshot = useCallback(() => true, []);

	return useSyncExternalStore(subscribeToQuery, getSnapshot, getServerSnapshot);
}
