import type { NavigateFunction } from 'react-router';

/**
 * Global navigation helper for use outside React components.
 *
 * This allows utilities like logout() to use React Router navigation
 * without causing a full page reload.
 *
 * Setup: Call setGlobalNavigate() in a component that renders early (e.g., Layout)
 * Usage: Call globalNavigate() from anywhere
 */

let navigateFn: NavigateFunction | null = null;

/**
 * Set the global navigate function.
 * Call this once from a component that has access to useNavigate.
 */
export const setGlobalNavigate = (fn: NavigateFunction): void => {
	navigateFn = fn;
};

/**
 * Navigate using React Router if available, otherwise fall back to window.location.
 * @param path - The path to navigate to
 * @param options - Options for navigation
 * @param options.replace - If true, replace current history entry (useful for logout)
 * @param options.forceReload - If true, always use window.location (full reload)
 */
export const globalNavigate = (
	path: string,
	options?: { replace?: boolean; forceReload?: boolean },
): void => {
	// SSR guard - no navigation on server
	if (typeof window === 'undefined') {
		return;
	}

	if (options?.forceReload || !navigateFn) {
		if (options?.replace) {
			window.location.replace(path);
		} else {
			window.location.href = path;
		}
		return;
	}

	void navigateFn(path, { replace: options?.replace });
};
