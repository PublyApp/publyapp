import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
	window.addEventListener('online', onChange);
	window.addEventListener('offline', onChange);
	return () => {
		window.removeEventListener('online', onChange);
		window.removeEventListener('offline', onChange);
	};
};

const getSnapshot = () => navigator.onLine;
/** Server snapshot `true` keeps hydration identical to the server markup. */
const getServerSnapshot = () => true;

/** `navigator.onLine`, live. */
export const useOnline = () =>
	useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
