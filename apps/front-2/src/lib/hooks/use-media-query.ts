import { useSyncExternalStore } from 'react';

function subscribe(query: string, callback: () => void): () => void {
	const mql = window.matchMedia(query);
	mql.addEventListener('change', callback);
	return () => mql.removeEventListener('change', callback);
}

/**
 * SSR snapshot is always `true` so the server renders the desktop layout;
 * a narrow client hydrates from the same markup and then reconciles once
 * `useSyncExternalStore` reads the real match on mount.
 */
export function useMediaQuery(query: string): boolean {
	return useSyncExternalStore(
		(callback) => subscribe(query, callback),
		() => window.matchMedia(query).matches,
		() => true,
	);
}
