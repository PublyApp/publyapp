import { create } from 'zustand';

/**
 * Cookie consent state for the marketing shell (#1038).
 *
 * Two rules shape this store:
 *
 * 1. **It fails closed.** Anything other than a well-formed, current-version
 *    stored decision — absent, malformed, unreadable storage, an older policy
 *    version — resolves to "no optional cookies" AND leaves the decision
 *    unresolved, so the band asks again. A consent store that fails open is
 *    a compliance defect, not a UX papercut.
 * 2. **Dismissing is rejecting.** There is no "ask me later" state: the
 *    band's close affordance is wired to the same action as "Reject all".
 *
 * Essential cookies are not represented as a toggle because they are not one
 * — they carry sign-in, tenant selection, security and this very consent
 * record, and cannot be switched off.
 */

export const COOKIE_CONSENT_STORAGE_KEY = 'publyapp:cookie-consent';

/**
 * Bump when the categories or their meaning change: a stored decision from an
 * older policy no longer describes what the user agreed to, so it is
 * discarded and re-asked rather than silently carried forward.
 */
export const COOKIE_CONSENT_POLICY_VERSION = '2026-03';

export const OPTIONAL_COOKIE_CATEGORIES = [
	'functional',
	'analytics',
	'marketing',
] as const;

export type OptionalCookieCategory =
	(typeof OPTIONAL_COOKIE_CATEGORIES)[number];

export type CookieConsent = Record<OptionalCookieCategory, boolean>;

export const REJECT_ALL_CONSENT = {
	functional: false,
	analytics: false,
	marketing: false,
} satisfies CookieConsent;

export const ACCEPT_ALL_CONSENT = {
	functional: true,
	analytics: true,
	marketing: true,
} satisfies CookieConsent;

type PersistedConsent = {
	version?: unknown;
	consent?: unknown;
};

const isBrowser = typeof window !== 'undefined';

const parseConsent = (raw: string | null): CookieConsent | null => {
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as PersistedConsent;
		if (parsed.version !== COOKIE_CONSENT_POLICY_VERSION) {
			return null;
		}

		const consent = parsed.consent;
		if (typeof consent !== 'object' || consent === null) {
			return null;
		}

		const record = consent as Record<string, unknown>;
		// Every category must be an explicit boolean: a partially-shaped
		// record is a corrupt decision, not a decision with defaults.
		for (const category of OPTIONAL_COOKIE_CATEGORIES) {
			if (typeof record[category] !== 'boolean') {
				return null;
			}
		}

		return {
			functional: record.functional === true,
			analytics: record.analytics === true,
			marketing: record.marketing === true,
		};
	} catch {
		return null;
	}
};

const readStoredConsent = (): CookieConsent | null => {
	if (!isBrowser) {
		return null;
	}

	try {
		return parseConsent(
			window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY),
		);
	} catch {
		return null;
	}
};

const writeStoredConsent = (consent: CookieConsent) => {
	if (!isBrowser) {
		return;
	}

	try {
		window.localStorage.setItem(
			COOKIE_CONSENT_STORAGE_KEY,
			JSON.stringify({ version: COOKIE_CONSENT_POLICY_VERSION, consent }),
		);
	} catch {
		// Storage can be unavailable (private mode, quota, blocked): the
		// in-memory decision still applies to this page view, and the band
		// asks again next time — failing closed, as above.
	}
};

type CookieConsentState = {
	/** `false` until a stored decision has been read on the client. */
	isHydrated: boolean;
	/** `true` once the visitor has actually decided (never on default state). */
	hasDecision: boolean;
	consent: CookieConsent;
};

type CookieConsentStore = CookieConsentState & {
	hydrateFromStorage: () => void;
	acceptAll: () => void;
	rejectAll: () => void;
	savePreferences: (consent: CookieConsent) => void;
};

const DEFAULT_STATE = {
	isHydrated: false,
	hasDecision: false,
	consent: REJECT_ALL_CONSENT,
};

export const useCookieConsentStore = create<CookieConsentStore>((set) => ({
	...DEFAULT_STATE,
	hydrateFromStorage: () => {
		const stored = readStoredConsent();
		set({
			isHydrated: true,
			hasDecision: stored !== null,
			consent: stored ?? REJECT_ALL_CONSENT,
		});
	},
	acceptAll: () => {
		writeStoredConsent(ACCEPT_ALL_CONSENT);
		set({ isHydrated: true, hasDecision: true, consent: ACCEPT_ALL_CONSENT });
	},
	rejectAll: () => {
		writeStoredConsent(REJECT_ALL_CONSENT);
		set({ isHydrated: true, hasDecision: true, consent: REJECT_ALL_CONSENT });
	},
	savePreferences: (consent) => {
		writeStoredConsent(consent);
		set({ isHydrated: true, hasDecision: true, consent });
	},
}));

/** Test seam: resets the module-level store between tests. */
export const resetCookieConsentStoreForTests = () => {
	useCookieConsentStore.setState({ ...DEFAULT_STATE });
};
