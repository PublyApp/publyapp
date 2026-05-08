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

// ----------------------------------------------------------------------

export const useConsentStore = create<ConsentStore>((set, get) => {
	return {
		...initialState,

		hydrate: () => {
			const stored = readStoredConsent();
			if (stored && !shouldRePrompt(stored)) {
				set(stateFromStored(stored));
			}
			// else: leave initial state with status='unknown' so banner renders.
		},

		acceptAll: () => {
			const next: ConsentState = {
				status: 'accepted',
				categories: { essential: true, analytics: true, marketing: true },
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
				decidedAt: new Date().toISOString(),
				dialogOpen: false,
			};
			set(next);
			persist(next);
		},

		setCategory: (cat, value) => {
			set((s) => {
				return {
					categories: { ...s.categories, [cat]: value },
				};
			});
			// Don't persist yet — user must press Save in the dialog.
		},

		save: () => {
			const s = get();
			const next: ConsentState = {
				status: 'customized',
				categories: s.categories,
				decidedAt: new Date().toISOString(),
				dialogOpen: false,
			};
			set(next);
			persist(next);
		},

		openPreferences: () => {
			set({ dialogOpen: true });
		},

		closePreferences: () => {
			set({ dialogOpen: false });
		},
	};
});
