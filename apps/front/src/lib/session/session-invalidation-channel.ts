type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Fired by the router's `QueryCache`/`MutationCache` `onError` backstop
 * (`router.tsx`) when any authed-surface query/mutation 401s — the one place
 * that invariant can no longer be forgotten, unlike the ~50 hand-written
 * per-route guards it sits alongside (see shell-F6). `router.tsx` is plain
 * module code outside the React tree, so it can't call `useLogout()`
 * directly; this module-level pub/sub is the seam a mounted React listener
 * (`__root.tsx`) uses to react to it.
 */
export const triggerSessionInvalidated = (): void => {
	for (const listener of listeners) {
		listener();
	}
};

export const subscribeToSessionInvalidated = (
	listener: Listener,
): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
