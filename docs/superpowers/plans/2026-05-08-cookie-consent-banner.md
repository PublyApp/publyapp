# Cookie consent banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a custom GDPR/CCPA-compliant cookie consent banner with categorized preferences dialog, persistent storage, a global API for downstream consent-aware scripts, and integration with the existing `/cookies` page placeholder + footer.

**Architecture:** New `apps/front/src/components/cookie-consent/` directory housing six small files (banner UI, dialog UI, Zustand store, window-API registration, hook, constants). Mounted site-wide in `root.tsx` behind `FEATURES.marketing.cookieConsent` (default off) and wrapped in `<ClientOnly>` because the store reads `localStorage`/`document.cookie` at hydration. Storage written atomically to BOTH localStorage and a non-httpOnly cookie. Re-prompts at 13 months or on policy version bump. Three categories: essential (forced on) / analytics / marketing.

**Tech Stack:** React 19, MUI v6, Zustand (already used project-wide via `useMainStore`), framer-motion (`m`/`varFade`), React Router v7, `remix-utils/client-only` (already used in `authed-layout.tsx`).

**Spec:** `docs/superpowers/specs/2026-05-08-cookie-consent-banner-design.md`

**Branch:** `feature/cookie-banner` (already created; spec already committed)

---

## Pre-flight context (read before starting)

- **No automated frontend tests in this repo** — quality gates per task: `just check-write` + `just tsc-front` + manual smoke for visible behavior.
- The banner is **flag-gated default OFF**. Code lands but doesn't auto-show until env var is flipped. This means most tasks won't have observable runtime behavior until Task 6 mounts the banner AND you temporarily flip the flag (instructions in Task 9 manual smoke).
- The store reads `localStorage`/`document.cookie` synchronously at module load. This is wrapped in a try/catch since SSR hits this path (no `window`) — but the `<ClientOnly>` mount in `root.tsx` means the store is never *consumed* on server. The try/catch is belt-and-braces.
- The footer's `HOME_FOOTER_LEGAL_LINKS` shape changes from `{ label, href }[]` to a discriminated union `(LinkLink | ButtonLink)[]`. This is Task 8 — must keep all existing footer links rendering identically before flipping any consumer.
- `window.__cookieConsent` API is registered in a `useEffect` inside `<CookieConsentBanner>`. The banner component is always mounted when the flag is on (even if its UI is hidden because consent is already granted) so the API is always attached when the flag is on.

---

## Task 1: Feature flag + constants module

**Files:**
- Modify: `apps/front/src/lib/features/flags.ts`
- Create: `apps/front/src/components/cookie-consent/consent-constants.ts`

- [ ] **Step 1: Add the feature flag**

Open `apps/front/src/lib/features/flags.ts`. The existing `marketing` block lists flags like `about`, `contact`, `security`, `blog`, `changelog`, etc. Add a new entry, sorted alphabetically with the existing block:

```ts
cookieConsent: readFlag('VITE_FEATURE_MARKETING_COOKIE_CONSENT', false),
```

The full file after edit (only the relevant portion shown — preserve everything else):

```ts
export const FEATURES = deepFreeze({
	marketing: {
		about: readFlag('VITE_FEATURE_MARKETING_ABOUT', true),
		contact: readFlag('VITE_FEATURE_MARKETING_CONTACT', true),
		security: readFlag('VITE_FEATURE_MARKETING_SECURITY', true),
		blog: readFlag('VITE_FEATURE_MARKETING_BLOG', true),
		changelog: readFlag('VITE_FEATURE_MARKETING_CHANGELOG', true),
		changelogStats: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_STATS', false),
		changelogSubscribe: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_SUBSCRIBE', false),
		cookieConsent: readFlag('VITE_FEATURE_MARKETING_COOKIE_CONSENT', false),
		languageSwitcher: readFlag('VITE_FEATURE_MARKETING_LANGUAGE_SWITCHER', false),
		integrations: readFlag('VITE_FEATURE_MARKETING_INTEGRATIONS', true),
		help: readFlag('VITE_FEATURE_MARKETING_HELP', true),
		community: readFlag('VITE_FEATURE_MARKETING_COMMUNITY', true),
	},
	staff: { /* unchanged */ },
});
```

- [ ] **Step 2: Create constants file**

Create `apps/front/src/components/cookie-consent/consent-constants.ts` with:

```ts
// Storage key shared by both localStorage and the cookie. Same key in both
// stores keeps the contract simple for downstream debuggers.
export const CONSENT_STORAGE_KEY = 'publyapp:cookie-consent';

// Bump to re-prompt all users (e.g. when adding a new category or changing
// the meaning of an existing one). Stored alongside the consent record so we
// can detect mismatches.
export const CONSENT_POLICY_VERSION = 1;

// CNIL guidance: re-prompt for consent at most every 13 months. ~395 days.
export const CONSENT_REPROMPT_AFTER_DAYS = 395;

// Cookie max-age. Most browsers cap JS-set cookies at 400 days.
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

// Schema version for the persisted record. Bump when changing the StoredConsent
// shape; the read path treats unknown schemas as invalid (re-prompts).
export const CONSENT_SCHEMA_VERSION = 1;
```

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/lib/features/flags.ts apps/front/src/components/cookie-consent/consent-constants.ts
git commit -m "feat(front): add cookieConsent feature flag + consent constants

Lays the foundation for the cookie consent banner (issue #370):
- New FEATURES.marketing.cookieConsent flag (default off; env var
  VITE_FEATURE_MARKETING_COOKIE_CONSENT to flip).
- Constants module with storage key, policy version, re-prompt
  window (CNIL 13mo), cookie max-age, schema version.

Refs #370

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Storage utilities

**Files:**
- Create: `apps/front/src/components/cookie-consent/consent-storage.ts`

A small module that handles read/write to BOTH localStorage and the cookie atomically, plus the schema validation + re-prompt decision. Pulled out of the store so the store stays focused on state transitions.

- [ ] **Step 1: Write the storage module**

Create `apps/front/src/components/cookie-consent/consent-storage.ts` with:

```ts
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
	if (typeof cats.analytics !== 'boolean' || typeof cats.marketing !== 'boolean') {
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
```

- [ ] **Step 2: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/components/cookie-consent/consent-storage.ts
git commit -m "feat(front): add consent-storage utilities (read/write/validate)

Schema-validated read from localStorage (fallback: cookie). Atomic
write to both stores. shouldRePrompt() encapsulates the re-prompt
decision tree (no record / stale policy / stale time). All functions
SSR-safe (typeof window guards).

Refs #370

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Zustand store + window API + React hook

**Files:**
- Create: `apps/front/src/components/cookie-consent/consent-store.ts`
- Create: `apps/front/src/components/cookie-consent/consent-window-api.ts`
- Create: `apps/front/src/components/cookie-consent/use-cookie-consent.ts`

Three small files: the standalone Zustand store, the global `window.__cookieConsent` registration, and the thin React hook.

- [ ] **Step 1: Write the Zustand store**

Create `apps/front/src/components/cookie-consent/consent-store.ts` with:

```ts
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
```

- [ ] **Step 2: Write the window API**

Create `apps/front/src/components/cookie-consent/consent-window-api.ts` with:

```ts
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
```

- [ ] **Step 3: Write the React hook**

Create `apps/front/src/components/cookie-consent/use-cookie-consent.ts` with:

```ts
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
```

- [ ] **Step 4: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. The discriminated `Window` augmentation should be picked up by TypeScript (no `tsconfig.json` change needed since the `declare global` is in a module that gets imported by other modules).

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/components/cookie-consent/consent-store.ts apps/front/src/components/cookie-consent/consent-window-api.ts apps/front/src/components/cookie-consent/use-cookie-consent.ts
git commit -m "feat(front): add consent store, window API, and React hook

Standalone Zustand store with hydrate/acceptAll/rejectAll/setCategory/
save/openPreferences/closePreferences actions. Window API exposes
hasConsented/openPreferences/subscribe and augments the global Window
type. Thin useCookieConsent() hook for React components.

Refs #370

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: CookieConsentBanner component

**Files:**
- Create: `apps/front/src/components/cookie-consent/cookie-consent-banner.tsx`

The bottom-anchored banner UI. Conditional rendering: only visible when `status === 'unknown'`. Handles its own `useEffect`s for hydration on mount and window-API registration.

- [ ] **Step 1: Write the banner component**

Create `apps/front/src/components/cookie-consent/cookie-consent-banner.tsx` with:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { m } from 'framer-motion';
import { useEffect } from 'react';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { varFade } from '#app/components/animate/variants/fade.ts';
import { RouterLink } from '#app/components/router-link.tsx';

import { registerCookieConsentWindowApi } from './consent-window-api';
import { CookiePreferencesDialog } from './cookie-preferences-dialog';
import { useCookieConsent } from './use-cookie-consent';

// ----------------------------------------------------------------------

export const CookieConsentBanner = () => {
	const consent = useCookieConsent();

	// Hydrate from storage + register window API on mount.
	useEffect(() => {
		consent.hydrate();
		registerCookieConsentWindowApi();
	}, []);

	const showBanner = consent.status === 'unknown';

	return (
		<>
			{showBanner && (
				<Box
					component={m.section}
					role="region"
					aria-label="Cookie consent"
					initial={varFade('inUp', { distance: 24 }).initial}
					animate={varFade('inUp', { distance: 24 }).animate}
					exit={varFade('inUp', { distance: 24 }).exit}
					sx={(theme) => ({
						position: 'fixed',
						bottom: 0,
						left: 0,
						right: 0,
						zIndex: theme.zIndex.snackbar - 1,
						bgcolor: 'background.paper',
						borderTop: '1px solid',
						borderColor: 'divider',
						boxShadow: theme.shadows[8],
					})}
				>
					<Container maxWidth="lg" sx={{ py: { xs: 2, sm: 2.5 } }}>
						<Stack
							direction={{ xs: 'column', md: 'row' }}
							spacing={{ xs: 2, md: 3 }}
							alignItems={{ xs: 'stretch', md: 'center' }}
							justifyContent="space-between"
						>
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Typography
									variant="subtitle2"
									sx={{ mb: 0.5, fontWeight: 600 }}
								>
									We use cookies
								</Typography>
								<Typography
									variant="body2"
									sx={{ color: 'text.secondary', lineHeight: 1.5 }}
								>
									Essential cookies keep the site working. With your consent, we
									also use analytics and marketing cookies. Read our{' '}
									<RouterLink
										href={FRONT_PATH_NAMES.marketing.cookies}
										style={{ color: 'inherit', textDecoration: 'underline' }}
									>
										Cookie Policy
									</RouterLink>
									.
								</Typography>
							</Box>
							<Stack
								direction={{ xs: 'column', sm: 'row' }}
								spacing={1}
								sx={{ flexShrink: 0 }}
							>
								<Button
									variant="text"
									size="medium"
									onClick={() => {
										consent.openPreferences();
									}}
								>
									Customize
								</Button>
								<Button
									variant="outlined"
									size="medium"
									onClick={() => {
										consent.rejectAll();
									}}
								>
									Reject all
								</Button>
								<Button
									variant="contained"
									size="medium"
									onClick={() => {
										consent.acceptAll();
									}}
								>
									Accept all
								</Button>
							</Stack>
						</Stack>
					</Container>
				</Box>
			)}
			<CookiePreferencesDialog />
		</>
	);
};
```

> **Note:** This file imports `<CookiePreferencesDialog>` which is created in Task 5. Until Task 5 lands, `just tsc-front` will fail with "Cannot find module './cookie-preferences-dialog'". Solve this by completing Tasks 4 and 5 in the same commit (combine them) — OR by adding a stub dialog file in this task and replacing it in Task 5. The plan below opts for **stub-then-replace** so each task remains a clean, independent commit.

- [ ] **Step 2: Add a stub dialog file (replaced in Task 5)**

Create `apps/front/src/components/cookie-consent/cookie-preferences-dialog.tsx` with this stub (will be fully written in Task 5):

```tsx
// Stub — full implementation lands in Task 5.
export const CookiePreferencesDialog = () => {
	return null;
};
```

- [ ] **Step 3: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/components/cookie-consent/cookie-consent-banner.tsx apps/front/src/components/cookie-consent/cookie-preferences-dialog.tsx
git commit -m "feat(front): add CookieConsentBanner (UI only — stub dialog)

Bottom-anchored, non-blocking banner with Accept all / Reject all /
Customize buttons. Slides up via varFade('inUp', { distance: 24 }).
Theme-aligned (palette tokens, no hex). Hydrates store + registers
window API on mount via useEffect. Conditional render on
status === 'unknown'. Dialog file stubbed — full UI in Task 5.

Refs #370

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: CookiePreferencesDialog component

**Files:**
- Modify: `apps/front/src/components/cookie-consent/cookie-preferences-dialog.tsx` (overwrite stub)

The categorized toggles modal. Three rows: essential (forced on, disabled), analytics, marketing. Footer with Reject all / Save preferences (primary) / Accept all.

- [ ] **Step 1: Replace the stub with the full implementation**

Overwrite `apps/front/src/components/cookie-consent/cookie-preferences-dialog.tsx` with:

```tsx
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';

import { useCookieConsent } from './use-cookie-consent';

// ----------------------------------------------------------------------

type CategoryRowProps = {
	title: string;
	description: string;
	checked: boolean;
	disabled?: boolean;
	disabledReason?: string;
	onChange?: (value: boolean) => void;
};

const CategoryRow = ({
	title,
	description,
	checked,
	disabled,
	disabledReason,
	onChange,
}: CategoryRowProps) => {
	const switchEl = (
		<Switch
			checked={checked}
			disabled={disabled}
			onChange={(_, value) => {
				onChange?.(value);
			}}
			inputProps={
				disabled ? { 'aria-disabled': true, 'aria-label': title } : { 'aria-label': title }
			}
		/>
	);

	return (
		<Box
			sx={{
				py: 2,
				borderBottom: '1px solid',
				borderColor: 'divider',
				'&:last-of-type': { borderBottom: 'none' },
			}}
		>
			<Stack
				direction="row"
				spacing={2}
				alignItems="flex-start"
				justifyContent="space-between"
			>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
						{title}
					</Typography>
					<Typography
						variant="body2"
						sx={{ color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}
					>
						{description}
					</Typography>
				</Box>
				<Box sx={{ flexShrink: 0 }}>
					<FormControlLabel
						control={
							disabled && disabledReason ? (
								<Tooltip title={disabledReason} placement="left" arrow>
									<span>{switchEl}</span>
								</Tooltip>
							) : (
								switchEl
							)
						}
						label=""
						labelPlacement="start"
						sx={{ m: 0 }}
					/>
				</Box>
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const CookiePreferencesDialog = () => {
	const consent = useCookieConsent();

	return (
		<Dialog
			open={consent.dialogOpen}
			onClose={() => {
				consent.closePreferences();
			}}
			maxWidth="sm"
			fullWidth
			aria-labelledby="cookie-preferences-title"
		>
			<DialogTitle
				id="cookie-preferences-title"
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					pr: 1,
				}}
			>
				<span>Cookie preferences</span>
				<IconButton
					autoFocus
					aria-label="Close cookie preferences"
					onClick={() => {
						consent.closePreferences();
					}}
				>
					<Iconify icon="mingcute:close-line" width={20} />
				</IconButton>
			</DialogTitle>

			<DialogContent dividers>
				<CategoryRow
					title="Essential"
					description="Required for the site to function (sign-in, workspace context, color scheme)."
					checked
					disabled
					disabledReason="Required for the site to function."
				/>
				<CategoryRow
					title="Analytics"
					description="Helps us understand how the product is used so we can improve it."
					checked={consent.categories.analytics}
					onChange={(value) => {
						consent.setCategory('analytics', value);
					}}
				/>
				<CategoryRow
					title="Marketing"
					description="Personalized content and embedded social media (videos, posts)."
					checked={consent.categories.marketing}
					onChange={(value) => {
						consent.setCategory('marketing', value);
					}}
				/>
			</DialogContent>

			<DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
				<Button
					variant="text"
					onClick={() => {
						consent.rejectAll();
					}}
				>
					Reject all
				</Button>
				<Button
					variant="outlined"
					onClick={() => {
						consent.acceptAll();
					}}
				>
					Accept all
				</Button>
				<Button
					variant="contained"
					onClick={() => {
						consent.save();
					}}
				>
					Save preferences
				</Button>
			</DialogActions>
		</Dialog>
	);
};
```

- [ ] **Step 2: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/components/cookie-consent/cookie-preferences-dialog.tsx
git commit -m "feat(front): add CookiePreferencesDialog (full UI)

MUI Dialog with three CategoryRow entries (essential/analytics/
marketing). Essential row uses disabled Switch + tooltip. Footer
buttons: Reject all / Accept all / Save preferences. Close icon
auto-focuses on open (clear screen-reader exit before tabbing into
options). Uses Iconify mingcute:close-line.

Refs #370

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Mount banner in root.tsx

**Files:**
- Modify: `apps/front/src/root.tsx`

Wraps `<CookieConsentBanner>` in `<ClientOnly>` (already in `remix-utils/client-only`) and mounts it inside the existing `<MotionLazy>` block, gated on `FEATURES.marketing.cookieConsent`.

- [ ] **Step 1: Add imports + mount**

Open `apps/front/src/root.tsx`. Add these imports near the existing import block (alphabetised within their groups):

```tsx
import { ClientOnly } from 'remix-utils/client-only';

import { CookieConsentBanner } from '#app/components/cookie-consent/cookie-consent-banner.tsx';
import { FEATURES } from '#app/lib/features/flags.ts';
```

Note: `FEATURES` is imported from `#app/lib/features/flags.ts`. If `root.tsx` already imports from that path, just add `FEATURES` to the existing import.

In the `Layout` component's JSX, find the existing `<MotionLazy>` block:

```tsx
<MotionLazy>
	<Snackbar />
	<ProgressBar />
	<SettingsDrawer defaultSettings={defaultSettings} />
	{children}
</MotionLazy>
```

Replace it with:

```tsx
<MotionLazy>
	<Snackbar />
	<ProgressBar />
	<SettingsDrawer defaultSettings={defaultSettings} />
	{children}
	{FEATURES.marketing.cookieConsent && (
		<ClientOnly fallback={null}>
			{() => {
				return <CookieConsentBanner />;
			}}
		</ClientOnly>
	)}
</MotionLazy>
```

- [ ] **Step 2: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/root.tsx
git commit -m "feat(front): mount CookieConsentBanner in root layout

Site-wide mount inside MotionLazy, gated on
FEATURES.marketing.cookieConsent (default off). Wrapped in ClientOnly
because the consent store reads localStorage/document.cookie at
hydration, which doesn't exist on the server. ClientOnly fallback is
null (banner is decorative, no SSR HTML to render).

Refs #370

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire the cookies-page placeholder

**Files:**
- Modify: `apps/front/src/routes/marketing/cookies/cookies-page.tsx`

Replace the `console.info(...)` placeholder with a real call to `window.__cookieConsent?.openPreferences()`. Also gate the `<CookiePreferencesCallout>` itself behind the feature flag (no point exposing the button if the API isn't there).

- [ ] **Step 1: Add import + replace handler + gate the callout**

Open `apps/front/src/routes/marketing/cookies/cookies-page.tsx`. Add this import near the top (in the appropriate import group):

```tsx
import { FEATURES } from '#app/lib/features/flags.ts';
```

Find the existing `CookiePreferencesCallout` component (around line 99-156). In its `onClick` handler, replace:

```tsx
onClick={() => {
	// Placeholder until the consent banner ships (out of scope per spec)
	// eslint-disable-next-line no-console
	console.info('[cookies] open preferences clicked');
}}
```

with:

```tsx
onClick={() => {
	window.__cookieConsent?.openPreferences();
}}
```

(The `// eslint-disable-next-line no-console` comment becomes redundant; remove it.)

Then, in the page's JSX, find the existing render of `<CookiePreferencesCallout />` (around line 304) and wrap it with the flag gate:

```tsx
{FEATURES.marketing.cookieConsent && <CookiePreferencesCallout />}
```

- [ ] **Step 2: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. The `window.__cookieConsent` global type augmentation from Task 3 should make this typecheck without `any`.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/marketing/cookies/cookies-page.tsx
git commit -m "feat(front): wire cookies-page callout to consent dialog

Replaces the console.info placeholder with a real call to
window.__cookieConsent?.openPreferences(). The callout itself is now
gated behind FEATURES.marketing.cookieConsent so it doesn't show up
on /cookies until the banner is enabled.

Refs #370

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Footer "Cookie Preferences" link (with FooterLink type refactor)

**Files:**
- Modify: `apps/front/src/layouts/main/footer.tsx`

Refactor the footer's link rendering to support both `href` (existing) and `onClick` (new). Add the "Cookie Preferences" entry to `HOME_FOOTER_LEGAL_LINKS`, gated on the feature flag.

- [ ] **Step 1: Inspect the current footer link rendering**

Open `apps/front/src/layouts/main/footer.tsx` and find:

1. The `HOME_FOOTER_LEGAL_LINKS` constant (around line 46-53).
2. The `FooterLinkColumn` type definition (around line 76).
3. The component that maps over `HOME_FOOTER_LINK_COLUMNS` and renders each link (search for `.map((link)` or similar within the file).

The rendering currently assumes every link has an `href`. Step 2 refactors it.

- [ ] **Step 2: Refactor `FooterLinkColumn` to a discriminated union**

Replace the existing `FooterLinkColumn` type definition with:

```ts
type FooterLink =
	| { label: string; href: string; onClick?: never }
	| { label: string; onClick: () => void; href?: never };

type FooterLinkColumn = {
	heading: string;
	links: FooterLink[];
};
```

- [ ] **Step 3: Add the Cookie Preferences entry**

Add this import at the top of the file (alongside `FRONT_PATH_NAMES`):

```ts
import { FEATURES } from '#app/lib/features/flags.ts';
```

Find `HOME_FOOTER_LEGAL_LINKS` and update it to include the new entry, gated on the cookieConsent flag:

```ts
const HOME_FOOTER_LEGAL_LINKS: FooterLink[] = [
	{ label: 'Terms of Use', href: FRONT_PATH_NAMES.marketing.terms },
	{ label: 'Privacy Policy', href: FRONT_PATH_NAMES.marketing.privacy },
	{ label: 'Cookie Policy', href: FRONT_PATH_NAMES.marketing.cookies },
	...(FEATURES.marketing.security
		? [{ label: 'Security', href: FRONT_PATH_NAMES.marketing.security } satisfies FooterLink]
		: []),
	...(FEATURES.marketing.cookieConsent
		? [
				{
					label: 'Cookie Preferences',
					onClick: () => {
						window.__cookieConsent?.openPreferences();
					},
				} satisfies FooterLink,
			]
		: []),
];
```

(The `satisfies FooterLink` annotation tells TypeScript the spread elements match the union exactly so the discriminated union narrowing works downstream.)

- [ ] **Step 4: Update the link renderer to handle both branches**

Find the JSX block that maps over a column's links. The existing code looks like:

```tsx
{column.links.map((link) => {
	return (
		<Link
			key={link.label}
			component={RouterLink}
			href={link.href}
			// ... styling
		>
			{link.label}
		</Link>
	);
})}
```

Replace it with a conditional that renders either a `<Link>` or a styled `<Box component="button">`:

```tsx
{column.links.map((link) => {
	if ('href' in link && link.href !== undefined) {
		return (
			<Link
				key={link.label}
				component={RouterLink}
				href={link.href}
				/* preserve existing sx styles here */
			>
				{link.label}
			</Link>
		);
	}
	return (
		<Box
			key={link.label}
			component="button"
			type="button"
			onClick={link.onClick}
			/* preserve existing sx styles here, but with these additions:
			   - background: 'none', border: 'none', padding: 0, cursor: 'pointer',
			   - font: 'inherit' to match the surrounding link visuals,
			   - text-align: 'left',
			   - color: matches the existing Link color
			*/
		>
			{link.label}
		</Box>
	);
})}
```

Inspect the existing `<Link>` `sx` props in your file and copy them onto the `<Box component="button">` so the visuals match exactly. The button's reset (`background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left'`) goes on top of the inherited link styles.

- [ ] **Step 5: Verify lint + tsc**

Run: `just check-write && just tsc-front`
Expected: 0 errors. The discriminated union narrowing requires the `'href' in link && link.href !== undefined` guard (not just `link.href` truthy check) so TypeScript can correctly narrow.

- [ ] **Step 6: Commit**

```bash
git add apps/front/src/layouts/main/footer.tsx
git commit -m "feat(front): add Cookie Preferences link to footer (Legal column)

FooterLink type widened to a discriminated union supporting either
href (renders as Link) or onClick (renders as styled button). New
'Cookie Preferences' entry in HOME_FOOTER_LEGAL_LINKS, gated on
FEATURES.marketing.cookieConsent. Calls
window.__cookieConsent?.openPreferences().

Refs #370

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Final verification + open PR

**Files:** none modified — verification gate.

This task ends with the PR opened. Manual smoke verification is documented in the PR body for the user (or a reviewer) to run before merging.

- [ ] **Step 1: Full lint + format pass**

Run: `just check-write`
Expected: 0 errors.

- [ ] **Step 2: Full TypeScript pass**

Run: `just tsc-front`
Expected: 0 errors.

- [ ] **Step 3: Quick smoke check (optional, recommended for the implementer)**

Set `VITE_FEATURE_MARKETING_COOKIE_CONSENT=true` in `apps/front/.env.development.local` (create if missing — this file is gitignored). Restart dev server. Visit `/` — banner appears. Click `Accept all`. Reload — banner does not reappear. Open DevTools console:

```js
window.__cookieConsent.hasConsented('analytics')   // → true
window.__cookieConsent.hasConsented('marketing')   // → true
```

If those work, the PR is ready. **Remove the `.env.development.local` line before pushing** (or leave the file uncommitted — it's gitignored).

- [ ] **Step 4: Commit log sanity check**

Run: `git log develop..HEAD --oneline`
Expected: 9 commits (1 spec + 1 plan + 7 implementation tasks + this verification has no commits, so 8 if Task 1's commit count is 1):

Approximate expected log (commit messages and hashes will vary):

```
docs(plan): cookie consent banner implementation plan
docs(spec): cookie consent banner design
feat(front): add cookieConsent feature flag + consent constants
feat(front): add consent-storage utilities (read/write/validate)
feat(front): add consent store, window API, and React hook
feat(front): add CookieConsentBanner (UI only — stub dialog)
feat(front): add CookiePreferencesDialog (full UI)
feat(front): mount CookieConsentBanner in root layout
feat(front): wire cookies-page callout to consent dialog
feat(front): add Cookie Preferences link to footer (Legal column)
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feature/cookie-banner

gh pr create --title "feat(front): cookie consent banner" --body "$(cat <<'EOF'
## Summary

- New `apps/front/src/components/cookie-consent/` directory with: banner UI, dialog UI, Zustand store, storage utils, window API, React hook, constants
- Site-wide mount in `root.tsx` inside `<ClientOnly>`, gated on `FEATURES.marketing.cookieConsent` (default `false`)
- Three categories: `essential` (forced on), `analytics`, `marketing`
- Persisted to BOTH localStorage and a non-httpOnly cookie atomically
- Re-prompt at 13mo (CNIL guidance) or on policy version bump
- `window.__cookieConsent` global API: `hasConsented(category)`, `openPreferences()`, `subscribe(cb)` — used by future #375 PostHog integration
- Cookies page placeholder (`cookies-page.tsx:121-127`) wired to call `openPreferences()`
- Footer Legal column gains "Cookie Preferences" entry; `FooterLink` type widened to discriminated union

Closes #370

## Test plan

- [x] \`just check-write\`
- [x] \`just tsc-front\`
- [ ] Manual smoke (light + dark mode):
  - [ ] Set \`VITE_FEATURE_MARKETING_COOKIE_CONSENT=true\` in \`.env.development\` (or local override), clear localStorage + the \`publyapp:cookie-consent\` cookie, reload \`/\` — banner appears.
  - [ ] Click \`Accept all\` — banner dismisses; reload — banner does not reappear; both categories \`true\` in localStorage + cookie.
  - [ ] Repeat with \`Reject all\` — both categories \`false\`.
  - [ ] Repeat with \`Customize\` → toggle analytics on, marketing off, save — \`status: 'customized'\`, categories match.
  - [ ] Visit \`/cookies\`, click "Open cookie preferences" — dialog opens with current state.
  - [ ] Click "Cookie Preferences" in footer — dialog opens with current state.
  - [ ] DevTools console: \`window.__cookieConsent.hasConsented('analytics')\` returns the correct boolean.
  - [ ] Bump \`CONSENT_POLICY_VERSION\` to 2, reload — banner reappears. Restore version 1.
  - [ ] Manually edit cookie's \`decidedAt\` to >395 days ago, reload — banner reappears.
  - [ ] Tab through banner with keyboard — all buttons reachable, focus visible.
  - [ ] Open dialog with keyboard, escape closes it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Report PR URL**

Capture the PR URL from `gh pr create` output and report it.

---

## Self-review notes (already applied)

- **Spec coverage:** every acceptance criterion in `docs/superpowers/specs/2026-05-08-cookie-consent-banner-design.md` maps to at least one task above.
  - AC: directory + 6 files → Tasks 1-5 cover all 6 files
  - AC: mount + flag → Task 6
  - AC: banner first-visit / persists / no reappear → Tasks 4 + 6 (storage round-trip via Tasks 2-3)
  - AC: 3 categories → Task 5 (UI), Task 3 (state), Task 2 (storage shape)
  - AC: storage in both → Task 2
  - AC: re-prompt logic → Task 2 (`shouldRePrompt` + Task 3 (`hydrate` consumes it)
  - AC: window API + type augmentation → Task 3
  - AC: cookies page wire-up → Task 7
  - AC: footer entry + FooterLink union → Task 8
  - AC: feature flag → Task 1
  - AC: dark + light visual parity → Task 4 + 5 (theme tokens only)
  - AC: no layout shift → Task 4 (`position: fixed`) + Task 6 (`<ClientOnly>` fallback null)
  - AC: lint + tsc pass → Task 9

- **No placeholders:** every step has concrete code or commands.

- **Type consistency:** `ConsentState`, `ConsentStore`, `ConsentCategories`, `StoredConsent`, `ConsentStatus`, `CookieConsentApi`, `FooterLink` are defined exactly once and referenced consistently across tasks.

- **The window API global type augmentation** (Task 3) means Tasks 7 and 8 can call `window.__cookieConsent?.openPreferences()` without `any` casts. The ordering matters: do Task 3 before Tasks 7/8.

- **The `CookiePreferencesDialog` stub-then-replace pattern in Tasks 4 + 5** keeps each commit independently green for `tsc`. Alternative: combine Tasks 4 + 5 into one larger commit if cleaner per-task review isn't valued here.
