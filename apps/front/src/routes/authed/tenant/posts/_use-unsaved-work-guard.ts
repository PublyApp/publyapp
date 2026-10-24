import { useBlocker } from '@tanstack/react-router';

/** Guards leaving the page while there is unsaved work: the router blocker
 * (resolved by the page's confirm dialog) on in-app navigation and, through
 * the same switch, the browser's own prompt on unload. */
export const useUnsavedWorkGuard = (hasUnsavedWork: boolean) =>
	useBlocker({
		shouldBlockFn: () => hasUnsavedWork,
		enableBeforeUnload: () => hasUnsavedWork,
		withResolver: true,
	});
