import { useEffect, useState } from 'react';

/**
 * `false` on the server and on the first client render (so SSR markup and the
 * first hydrated paint match exactly, avoiding a hydration mismatch), then
 * flips to `true` once React has attached event handlers. Gate any
 * SSR-rendered `<form>`'s `<fieldset disabled>` on this — otherwise the
 * native, handler-less markup is submittable (a plain `GET`, credentials in
 * the URL) for the window between paint and hydration.
 */
export const useHydrated = (): boolean => {
	const [isHydrated, setIsHydrated] = useState(false);

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	return isHydrated;
};
