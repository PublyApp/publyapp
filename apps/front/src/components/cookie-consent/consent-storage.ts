import {
	CONSENT_COOKIE_MAX_AGE_SECONDS,
	CONSENT_POLICY_VERSION,
	CONSENT_REPROMPT_AFTER_DAYS,
	CONSENT_SCHEMA_VERSION,
	CONSENT_STORAGE_KEY,
} from './consent-constants';

// ----------------------------------------------------------------------

export type ConsentCategories = {
	analytics: boolean;
	marketing: boolean;
};

export type StoredConsent = {
	v: number;
	policy: number;
	status: 'accepted' | 'rejected' | 'customized';
	categories: ConsentCategories;
	decidedAt: string;
};

// ----------------------------------------------------------------------

const isBrowser = (): boolean => {
	return typeof window !== 'undefined' && typeof document !== 'undefined';
};

const isProduction = (): boolean => {
	return import.meta.env.PROD === true;
};

// ----------------------------------------------------------------------

const readFromLocalStorage = (): StoredConsent | null => {
	if (!isBrowser()) {
		return null;
	}
	try {
		const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as unknown;
		return validateStoredConsent(parsed);
	} catch {
		return null;
	}
};

const readFromCookie = (): StoredConsent | null => {
	if (!isBrowser()) {
		return null;
	}
	try {
		const cookies = document.cookie.split(';');
		for (const entry of cookies) {
			const [k, ...v] = entry.split('=');
			if (k && k.trim() === CONSENT_STORAGE_KEY) {
				const value = decodeURIComponent(v.join('=').trim());
				const parsed = JSON.parse(value) as unknown;
				return validateStoredConsent(parsed);
			}
		}
		return null;
	} catch {
		return null;
	}
};

// localStorage wins over cookie if both present and divergent (rare —
// happens only on manual edit). Returns null if neither has a valid record.
export const readStoredConsent = (): StoredConsent | null => {
	return readFromLocalStorage() ?? readFromCookie();
};

// ----------------------------------------------------------------------

const writeToLocalStorage = (stored: StoredConsent): void => {
	if (!isBrowser()) {
		return;
	}
	try {
		window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
	} catch {
		// localStorage may be disabled (private mode, quota); cookie is the fallback.
	}
};

const writeToCookie = (stored: StoredConsent): void => {
	if (!isBrowser()) {
		return;
	}
	try {
		const value = encodeURIComponent(JSON.stringify(stored));
		const parts = [
			`${CONSENT_STORAGE_KEY}=${value}`,
			`Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}`,
			'Path=/',
			'SameSite=Lax',
		];
		if (isProduction()) {
			parts.push('Secure');
		}
		document.cookie = parts.join('; ');
	} catch {
		// document.cookie may throw in some sandboxed contexts; ignore.
	}
};

// Atomic write to BOTH stores. Always called via store actions, never directly.
export const persistStoredConsent = (stored: StoredConsent): void => {
	writeToLocalStorage(stored);
	writeToCookie(stored);
};

// ----------------------------------------------------------------------

const validateStoredConsent = (input: unknown): StoredConsent | null => {
	if (typeof input !== 'object' || input === null) {
		return null;
	}
	const obj = input as Record<string, unknown>;
	if (typeof obj.v !== 'number' || obj.v !== CONSENT_SCHEMA_VERSION) {
		return null;
	}
	if (typeof obj.policy !== 'number') {
		return null;
	}
	if (
		obj.status !== 'accepted' &&
		obj.status !== 'rejected' &&
		obj.status !== 'customized'
	) {
		return null;
	}
	if (typeof obj.categories !== 'object' || obj.categories === null) {
		return null;
	}
	const cats = obj.categories as Record<string, unknown>;
	if (
		typeof cats.analytics !== 'boolean' ||
		typeof cats.marketing !== 'boolean'
	) {
		return null;
	}
	if (typeof obj.decidedAt !== 'string') {
		return null;
	}
	return {
		v: obj.v,
		policy: obj.policy,
		status: obj.status,
		categories: { analytics: cats.analytics, marketing: cats.marketing },
		decidedAt: obj.decidedAt,
	};
};

// ----------------------------------------------------------------------

const daysSince = (isoTimestamp: string): number => {
	const then = new Date(isoTimestamp).getTime();
	if (Number.isNaN(then)) {
		return Infinity;
	}
	const now = Date.now();
	return (now - then) / (1000 * 60 * 60 * 24);
};

// True when we should show the banner (no record, stale policy, or stale time).
export const shouldRePrompt = (stored: StoredConsent | null): boolean => {
	if (!stored) {
		return true;
	}
	if (stored.policy < CONSENT_POLICY_VERSION) {
		return true;
	}
	if (daysSince(stored.decidedAt) > CONSENT_REPROMPT_AFTER_DAYS) {
		return true;
	}
	return false;
};

// ----------------------------------------------------------------------

// Build the StoredConsent payload from the decision branch. status='accepted'
// or 'rejected' both stamp categories accordingly; 'customized' uses the
// passed values verbatim.
export const buildStoredConsent = (
	status: StoredConsent['status'],
	categories: ConsentCategories,
): StoredConsent => {
	return {
		v: CONSENT_SCHEMA_VERSION,
		policy: CONSENT_POLICY_VERSION,
		status,
		categories,
		decidedAt: new Date().toISOString(),
	};
};
