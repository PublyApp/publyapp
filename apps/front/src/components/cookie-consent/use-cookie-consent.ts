import { useConsentStore } from './consent-store';

// ----------------------------------------------------------------------

// Thin selector hook so React components don't need to touch the store
// directly (and don't need to remember which store name to import).
export const useCookieConsent = () => {
	return useConsentStore((s) => {
		return {
			status: s.status,
			categories: s.categories,
			dialogOpen: s.dialogOpen,
			acceptAll: s.acceptAll,
			rejectAll: s.rejectAll,
			setCategory: s.setCategory,
			save: s.save,
			openPreferences: s.openPreferences,
			closePreferences: s.closePreferences,
			hydrate: s.hydrate,
		};
	});
};
