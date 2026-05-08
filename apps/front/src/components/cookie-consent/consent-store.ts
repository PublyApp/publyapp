import { create } from 'zustand';

import {
	type ConsentCategories,
	type StoredConsent,
	buildStoredConsent,
	persistStoredConsent,
	readStoredConsent,
	shouldRePrompt,
} from './consent-storage';

// ----------------------------------------------------------------------

export type ConsentStatus = 'unknown' | 'accepted' | 'rejected' | 'customized';

export type ConsentState = {
	status: ConsentStatus;
	categories: { essential: true; analytics: boolean; marketing: boolean };
	// In-flight values inside the preferences dialog. Mutated by setCategory()
	// while the dialog is open; only committed to `categories` on save(). This
	// keeps `categories` (and the window.__cookieConsent.hasConsented() reads
	// + subscriber callbacks) in sync with the *persisted* state — closing
	// the dialog without saving never leaks unsaved toggles to consumers.
	editingCategories: { analytics: boolean; marketing: boolean };
	decidedAt: string | null;
	dialogOpen: boolean;
};

type ConsentActions = {
	hydrate: () => void;
	acceptAll: () => void;
	rejectAll: () => void;
	setCategory: (cat: 'analytics' | 'marketing', value: boolean) => void;
	save: () => void;
	openPreferences: () => void;
	closePreferences: () => void;
};

export type ConsentStore = ConsentState & ConsentActions;

// ----------------------------------------------------------------------

const initialState: ConsentState = {
	status: 'unknown',
	categories: { essential: true, analytics: false, marketing: false },
	editingCategories: { analytics: false, marketing: false },
	decidedAt: null,
	dialogOpen: false,
};

const stateFromStored = (stored: StoredConsent): ConsentState => {
	return {
		status: stored.status,
		categories: {
			essential: true,
			analytics: stored.categories.analytics,
			marketing: stored.categories.marketing,
		},
		editingCategories: {
			analytics: stored.categories.analytics,
			marketing: stored.categories.marketing,
		},
		decidedAt: stored.decidedAt,
		dialogOpen: false,
	};
};

const persist = (state: ConsentState): void => {
	if (state.status === 'unknown' || state.decidedAt === null) {
		return;
	}
	const categories: ConsentCategories = {
		analytics: state.categories.analytics,
		marketing: state.categories.marketing,
	};
	persistStoredConsent(buildStoredConsent(state.status, categories));
};

// Read storage synchronously at module load so the first render of
// <CookieConsentBanner> already knows whether to display the banner UI.
// Eliminates the one-frame banner flash that the useEffect-based hydration
// would cause for already-consented users on every full page load.
//
// Safe under SSR: readStoredConsent() guards on typeof window and returns
// null on the server, so the initial state collapses to `initialState`
// (status: 'unknown') for server-side renders. The <ClientOnly> wrapper in
// root.tsx means the banner doesn't render on server anyway, so server
// state divergence is moot.
const computeInitialState = (): ConsentState => {
	const stored = readStoredConsent();
	if (stored && !shouldRePrompt(stored)) {
		return stateFromStored(stored);
	}
	return initialState;
};

// ----------------------------------------------------------------------

export const useConsentStore = create<ConsentStore>((set, get) => {
	return {
		...computeInitialState(),

		// Kept for explicit re-hydration scenarios (e.g. tab focus, future
		// cross-tab sync). Idempotent — safe to call multiple times.
		hydrate: () => {
			const stored = readStoredConsent();
			if (stored && !shouldRePrompt(stored)) {
				set(stateFromStored(stored));
			}
		},

		acceptAll: () => {
			const next: ConsentState = {
				status: 'accepted',
				categories: { essential: true, analytics: true, marketing: true },
				editingCategories: { analytics: true, marketing: true },
				decidedAt: new Date().toISOString(),
				dialogOpen: false,
			};
			set(next);
			persist(next);
		},

		rejectAll: () => {
			const next: ConsentState = {
				status: 'rejected',
				categories: { essential: true, analytics: false, marketing: false },
				editingCategories: { analytics: false, marketing: false },
				decidedAt: new Date().toISOString(),
				dialogOpen: false,
			};
			set(next);
			persist(next);
		},

		setCategory: (cat, value) => {
			// Only updates the in-flight dialog editing state. Closing the
			// dialog without `save()` discards these changes; subscribers and
			// `window.__cookieConsent.hasConsented(...)` keep reading the
			// last-committed `categories` until save() commits.
			set((s) => {
				return {
					editingCategories: { ...s.editingCategories, [cat]: value },
				};
			});
		},

		save: () => {
			const s = get();
			const next: ConsentState = {
				status: 'customized',
				categories: {
					essential: true,
					analytics: s.editingCategories.analytics,
					marketing: s.editingCategories.marketing,
				},
				editingCategories: s.editingCategories,
				decidedAt: new Date().toISOString(),
				dialogOpen: false,
			};
			set(next);
			persist(next);
		},

		openPreferences: () => {
			// Seed editingCategories from the currently-committed values so
			// the dialog opens reflecting the persisted state.
			set((s) => {
				return {
					dialogOpen: true,
					editingCategories: {
						analytics: s.categories.analytics,
						marketing: s.categories.marketing,
					},
				};
			});
		},

		closePreferences: () => {
			// Discard in-flight edits — restore editingCategories to match
			// the committed state. Important: do NOT touch `categories`,
			// which would propagate to subscribers as a fake "change".
			set((s) => {
				return {
					dialogOpen: false,
					editingCategories: {
						analytics: s.categories.analytics,
						marketing: s.categories.marketing,
					},
				};
			});
		},
	};
});
