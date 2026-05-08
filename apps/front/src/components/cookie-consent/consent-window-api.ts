import { type ConsentState, useConsentStore } from './consent-store';

// ----------------------------------------------------------------------

export type CookieConsentApi = {
	hasConsented: (category: 'analytics' | 'marketing') => boolean;
	openPreferences: () => void;
	subscribe: (cb: (state: ConsentState) => void) => () => void;
};

declare global {
	interface Window {
		__cookieConsent?: CookieConsentApi;
	}
}

// ----------------------------------------------------------------------

let isRegistered = false;

// Idempotent. Called from <CookieConsentBanner>'s useEffect on mount.
export const registerCookieConsentWindowApi = (): void => {
	if (typeof window === 'undefined') {
		return;
	}
	if (isRegistered) {
		return;
	}
	isRegistered = true;

	window.__cookieConsent = {
		hasConsented: (category) => {
			return useConsentStore.getState().categories[category];
		},
		openPreferences: () => {
			useConsentStore.getState().openPreferences();
		},
		subscribe: (cb) => {
			return useConsentStore.subscribe((state) => {
				cb(state);
			});
		},
	};
};
