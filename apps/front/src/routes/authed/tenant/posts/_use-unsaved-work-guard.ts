import { useBlocker } from '@tanstack/react-router';
import { useEffect } from 'react';

/** Guards leaving the page while there is unsaved work: the browser's own
 * prompt on unload, and the router blocker (resolved by the page's confirm
 * dialog) on in-app navigation. */
export const useUnsavedWorkGuard = (hasUnsavedWork: boolean) => {
	useEffect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (hasUnsavedWork) {
				e.preventDefault();
			}
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [hasUnsavedWork]);

	return useBlocker({
		shouldBlockFn: () => hasUnsavedWork,
		withResolver: true,
	});
};
