import { useShallow } from 'zustand/react/shallow';

import { useConsentStore } from './consent-store';

// ----------------------------------------------------------------------

// Thin selector hook so React components don't need to touch the store
// directly. Wrapped in useShallow so unrelated store updates (e.g. a
// subscribe-only consumer mutating an unrelated slice in the future)
// don't trigger spurious re-renders of the banner / dialog.
export const useCookieConsent = () => {
	return useConsentStore(
		useShallow((s) => {
			return {
				status: s.status,
				categories: s.categories,
				editingCategories: s.editingCategories,
				dialogOpen: s.dialogOpen,
				acceptAll: s.acceptAll,
				rejectAll: s.rejectAll,
				setCategory: s.setCategory,
				save: s.save,
				openPreferences: s.openPreferences,
				closePreferences: s.closePreferences,
				hydrate: s.hydrate,
			};
		}),
	);
};
