# Cookie consent banner — design spec

**Date:** 2026-05-08
**Issue:** [#370 — Cookie consent banner — GDPR/CCPA-compliant](https://github.com/radandevist/publyapp-5/issues/370)
**PR scope:** single PR. Custom-built banner + categorized preferences dialog + global API for downstream consent-aware scripts.

## Goal

Ship a fully custom, theme-aligned, GDPR/CCPA-compliant cookie consent banner that mounts site-wide (marketing, auth, dashboard), exposes a `window.__cookieConsent` global so future analytics scripts (#375, PostHog) can gate themselves, and provides the missing "Open cookie preferences" handler for the placeholder button at `cookies-page.tsx:121-127`.

The implementation is single-purpose and self-contained: no 3rd-party widget, no hosted script, no recurring cost, no vendor lock-in.

## Scope decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| 1 | Custom-built (not klaro!js or CookieYes) | Marketing surface is a hand-crafted design system; a 3rd-party widget would be a brand regression at the most prominent first-impression UI element |
| 2 | Always-show (no IP-geo gating) | Simpler architecture, single code path, industry SaaS default, no VPN/mobile false-negatives, compliance margin across EU/UK/CA/BR jurisdictions |
| 3 | 3 categories (essential / analytics / marketing) | Maps to what `COOKIES_INVENTORY` actually documents (3 essentials + 2 GA + 1 Intercom). The issue's optional 4th `functional` category would currently have one user (color-scheme) — over-engineering for a single innocuous cookie |
| 4 | Footer link + cookies-page button (no floating re-access button) | De facto SaaS pattern (Stripe, Vercel, Linear). Marketing chrome is already busy (BackToTop bottom-right, ScrollProgress top); another floating element would compete |
| 5 | Mount at root.tsx (not MarketingLayout) | Banner needs visibility across marketing + auth + dashboard. Auth surface already sets `publyapp_session` cookie; analytics scripts (#375) will fire from dashboard surface too |
| 6 | Zustand state (matches `useMainStore` precedent) | Project already uses Zustand for global UI state |
| 7 | Storage in BOTH localStorage and a non-httpOnly cookie | localStorage for client-side reads; cookie for SSR-aware decisions later if needed; both rewritten on any change |
| 8 | Re-prompt at 13 months OR on policy version bump | CNIL guidance; standard EU compliance window |
| 9 | Gated behind `FEATURES.marketing.cookieConsent` (default `false`) | Ship the code without auto-showing the banner; flip env var when team has verified |

## Architecture

### Mount point

`apps/front/src/root.tsx`'s `<Layout>` component, inside the existing `<MotionLazy>` wrapper. Wrapped in `<ClientOnly>` from `remix-utils/client-only` (already used elsewhere in the project, e.g. `authed-layout.tsx`) because the store reads `localStorage`/`document.cookie` at hydration. The whole tree:

```tsx
<MotionLazy>
	<Snackbar />
	<ProgressBar />
	<SettingsDrawer defaultSettings={defaultSettings} />
	{children}
	{FEATURES.marketing.cookieConsent && (
		<ClientOnly>{() => <CookieConsentBanner />}</ClientOnly>
	)}
</MotionLazy>
```

Conditional on `FEATURES.marketing.cookieConsent`. The banner does not render on server (no SEO value, no useful HTML to deliver), so `ClientOnly` is the correct boundary.

### State management

A new Zustand store at `apps/front/src/components/cookie-consent/consent-store.ts` (separate from `useMainStore` to keep the consent module self-contained):

```ts
type ConsentState = {
	status: 'unknown' | 'accepted' | 'rejected' | 'customized';
	categories: { essential: true; analytics: boolean; marketing: boolean };
	version: number;
	decidedAt: string | null;
};
```

The `essential` category is typed as the literal `true` so the UI can't accidentally toggle it off (compile-time enforcement).

### Storage

Two parallel writes, both updated atomically on any state change:

| Store | Key | Format | Lifetime |
|---|---|---|---|
| `localStorage` | `publyapp:cookie-consent` | JSON-serialized `StoredConsent` | indefinite (until user clears, or schema/policy bump) |
| Cookie | `publyapp:cookie-consent` | URL-encoded JSON-serialized `StoredConsent` | `max-age=60*60*24*400` (~13 months — browser cap on JS-set cookies). `Path=/`, `SameSite=Lax`, `Secure` in production |

Read order on mount: localStorage first, fallback to cookie if missing. If both present and divergent (rare — manual edit), localStorage wins.

### Storage schema

```ts
type StoredConsent = {
	v: number;              // schema version (currently 1)
	policy: number;         // policy version (CONSENT_POLICY_VERSION)
	status: 'accepted' | 'rejected' | 'customized';
	categories: { analytics: boolean; marketing: boolean };
	// essential is always true; not stored to avoid drift
	decidedAt: string;      // ISO timestamp
};
```

### Constants module

`apps/front/src/components/cookie-consent/consent-constants.ts`:

```ts
export const CONSENT_STORAGE_KEY = 'publyapp:cookie-consent';
export const CONSENT_POLICY_VERSION = 1;
export const CONSENT_REPROMPT_AFTER_DAYS = 395;   // ~13 months, CNIL guidance
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
```

### Re-prompt decision tree

Run at mount inside `<CookieConsentBanner>`:

```
read StoredConsent from localStorage (fallback: cookie)
├─ no record                          → render banner (status: 'unknown')
├─ JSON parse fails OR shape invalid  → render banner
├─ stored.policy < CONSENT_POLICY_VERSION → render banner
├─ days since stored.decidedAt > CONSENT_REPROMPT_AFTER_DAYS → render banner
└─ otherwise                          → don't render banner; hydrate store
```

### Migration story

Schema version `v` field. v1 is the only schema for now. Future schema bumps check `stored.v` first and either migrate or treat as invalid (which triggers re-prompt). No active migration code in v1.

## Components

Five new files under `apps/front/src/components/cookie-consent/`:

```
apps/front/src/components/cookie-consent/
├── cookie-consent-banner.tsx       (~150 lines — bottom-anchored banner)
├── cookie-preferences-dialog.tsx   (~180 lines — categorized toggles modal)
├── consent-store.ts                (~100 lines — Zustand store + storage sync)
├── consent-window-api.ts           (~50 lines  — window.__cookieConsent registration)
├── use-cookie-consent.ts           (~30 lines  — React hook)
└── consent-constants.ts            (~10 lines  — keys + policy version + max-age)
```

### `<CookieConsentBanner>`

- Bottom-anchored, full-width, **non-blocking** (no backdrop, no click-trap).
- Rendered conditionally when `status === 'unknown'` per the re-prompt decision tree.
- `position: fixed; bottom: 0; left: 0; right: 0; zIndex: theme.zIndex.snackbar - 1` — above page content, below toast notifications.
- Three buttons: `Accept all` (contained primary), `Reject all` (outlined), `Customize` (text). The first two close + persist; `Customize` opens the dialog.
- Slim copy: title + 2-line body + link to `/cookies`.
- Slide-up entry via `varFade('inUp', { distance: 24 })` (matches the canon).
- Theme-aligned: `bgcolor: background.paper`, `borderTop: '1px solid'`, `borderColor: divider`. No hardcoded colors. Dark-mode "just works" via theme tokens.
- Accessibility: wrapped in `<section role="region" aria-label="Cookie consent">`. Buttons are keyboard-focusable in DOM order. Banner does NOT auto-focus on mount (would yank focus from page content).

### `<CookiePreferencesDialog>`

- MUI `<Dialog>` (modal, focus-trapped, escape-closeable, `aria-modal="true"` via MUI defaults).
- Header: "Cookie preferences" + close icon-button (first focusable element on open).
- Three rows, one per category, each containing a `<FormControlLabel>` wrapping a `<Switch>`:
  - **Essential** — `disabled checked`, body "Required for the site to function." `aria-disabled="true"`, tooltip "Required for the site to function."
  - **Analytics** — reflects current state, body "Helps us understand how the product is used."
  - **Marketing** — reflects current state, body "Personalized content and embedded social media."
- Footer: `Reject all`, `Save preferences` (contained primary), `Accept all`.
- Opened from the banner OR via `window.__cookieConsent.openPreferences()` (called by the cookies page button + footer link).

### `consent-store.ts`

Zustand store with state matching `ConsentState` and actions:

```ts
type ConsentActions = {
	hydrate: () => void;          // read from storage; idempotent; called on mount
	acceptAll: () => void;
	rejectAll: () => void;
	setCategory: (cat: 'analytics' | 'marketing', value: boolean) => void;
	save: () => void;             // status='customized'; persist current categories
	openPreferences: () => void;  // sets a transient `dialogOpen` flag
	closePreferences: () => void;
};
```

Persistence: every action that mutates `categories` or `status` calls a private `persist()` helper that writes to BOTH localStorage and the cookie. `acceptAll` / `rejectAll` / `save` also stamp `decidedAt` to `new Date().toISOString()`.

### `consent-window-api.ts`

Side-effecting module that registers `window.__cookieConsent` once, called from a `useEffect` in `<CookieConsentBanner>` (which is always mounted when the flag is on, even if the banner UI itself is hidden):

```ts
window.__cookieConsent = {
	hasConsented: (category: 'analytics' | 'marketing') => boolean;
	openPreferences: () => void;
	subscribe: (cb: (state: ConsentState) => void) => () => void;
};
```

`hasConsented` reads the current store snapshot. `openPreferences` calls the store action. `subscribe` wraps Zustand's `subscribe` and returns the unsubscribe function (per the standard Zustand subscribe contract).

### `useCookieConsent()`

Thin React hook returning `{ state, acceptAll, rejectAll, setCategory, save, openPreferences }` so React components don't need to touch the store directly. Uses Zustand's selector pattern internally.

### TypeScript module augmentation

A single `declare global { interface Window { __cookieConsent?: CookieConsentApi } }` lives at the top of `consent-window-api.ts` so consumers (including future #375 PostHog integration) get type completion when reading `window.__cookieConsent`.

## Integration points

### 1. Cookies page placeholder → real handler

`apps/front/src/routes/marketing/cookies/cookies-page.tsx:121-127` currently has:

```tsx
onClick={() => {
	console.info('[cookies] open preferences clicked');
}}
```

Replace with:

```tsx
onClick={() => {
	window.__cookieConsent?.openPreferences();
}}
```

Optional chaining covers SSR + pre-mount window where the API isn't yet attached.

### 2. Footer "Cookie Preferences" link

`apps/front/src/layouts/main/footer.tsx` — add a button-style entry to `HOME_FOOTER_LEGAL_LINKS`:

```tsx
const HOME_FOOTER_LEGAL_LINKS: FooterLink[] = [
	{ label: 'Terms of Use', href: FRONT_PATH_NAMES.marketing.terms },
	{ label: 'Privacy Policy', href: FRONT_PATH_NAMES.marketing.privacy },
	{ label: 'Cookie Policy', href: FRONT_PATH_NAMES.marketing.cookies },
	...(FEATURES.marketing.security
		? [{ label: 'Security', href: FRONT_PATH_NAMES.marketing.security }]
		: []),
	...(FEATURES.marketing.cookieConsent
		? [{
			label: 'Cookie Preferences',
			onClick: () => window.__cookieConsent?.openPreferences(),
		}]
		: []),
];
```

The footer's link rendering loop currently assumes every entry has `href`. Small refactor: the `FooterLink` type becomes a discriminated union (`{ label, href }` | `{ label, onClick }`), and the renderer chooses `<RouterLink>` for `href` entries and `<Box component="button">` (styled to match link visuals exactly) for `onClick` entries. ~15 lines of surgical change.

### 3. Feature flag

Add to `apps/front/src/lib/features/flags.ts` under `marketing`:

```ts
cookieConsent: readFlag('VITE_FEATURE_MARKETING_COOKIE_CONSENT', false),
```

The mount in `root.tsx` is gated:

```tsx
{FEATURES.marketing.cookieConsent && <CookieConsentBanner />}
```

The cookies-page button placeholder is also gated (no point exposing the button if the API isn't there):

```tsx
{FEATURES.marketing.cookieConsent && <CookiePreferencesCallout />}
```

When ready to go live, set `VITE_FEATURE_MARKETING_COOKIE_CONSENT=true` in production env.

### 4. Out of scope: #375 PostHog integration

This PR ships the `window.__cookieConsent` contract. The PostHog loader (in #375) consumes it. Sample integration shape, for reference (NOT in this PR):

```tsx
useEffect(() => {
	if (window.__cookieConsent?.hasConsented('analytics')) {
		loadPostHog();
	}
	return window.__cookieConsent?.subscribe((state) => {
		if (state.categories.analytics) loadPostHog();
		else unloadPostHog();
	});
}, []);
```

## Accessibility

| Surface | Guarantee |
|---|---|
| Banner role | `<section role="region" aria-label="Cookie consent">` so screen readers announce |
| Banner buttons | Real `<button>` via MUI `<Button>`, keyboard-focusable in DOM order |
| Banner focus management | Does NOT auto-focus on mount; preserves caller focus on dismiss |
| Dialog modality | MUI `<Dialog>` provides focus-trap, `aria-modal="true"`, escape-to-close natively |
| Dialog first focus | Close icon-button (so screen readers announce a clear exit before tabbing into options) |
| Switch labels | Each `<Switch>` wrapped in `<FormControlLabel>` for accessible name |
| Disabled essential | `Switch` has `disabled` attribute, `aria-disabled="true"`, tooltip explaining why |
| Reduced motion | All motion via `varFade` which respects `prefers-reduced-motion` (MUI handling) |

## Motion + theming

- Banner enters: `varFade('inUp', { distance: 24 })`. Matches AppErrorView motion canon from #371.
- Banner exits: same variant in reverse on dismissal.
- Dialog: MUI default Fade transition.
- Theming: `bgcolor: background.paper`, `borderTop: '1px solid'`, `borderColor: divider`, `boxShadow: theme.customShadows.z8` (verify exact token during impl). All buttons use existing MUI variants.
- No hardcoded hex values, no `linear-gradient` text effects (matches marketing surface conventions).
- Dark-mode: works via theme palette tokens with no custom overrides.

## Layout interaction

- `position: fixed; bottom: 0` → does NOT participate in document layout. No layout shift at first paint.
- Banner is `<ClientOnly>`-wrapped, so it only renders post-hydration on the client. Within client-side rendering, the Zustand store reads storage synchronously in its creation function (one-shot, before any React render of the banner) so the first banner render already knows whether to display the UI. Net effect: no banner-pops-in-after-hydration flash for users who have already consented.
- z-index: `theme.zIndex.snackbar - 1` — above page content, below toast notifications.

## Testing strategy

No automated frontend tests in this repo (per AGENTS.md). Quality gates:

| Gate | Command | What it catches |
|---|---|---|
| Lint + format | `just check-write` | style regressions |
| Type check | `just tsc-front` | broken store contract, footer link union type errors, window type augmentation |
| Manual smoke | `just dev-front` with flag flipped on | first-visit banner shows, accept/reject/customize all persist, re-open via cookies page button + footer link, dark-mode, reduced-motion |

### Manual smoke checklist

Verify in **light + dark mode** for each:

1. Set `VITE_FEATURE_MARKETING_COOKIE_CONSENT=true` in `.env.development`, restart dev server.
2. Clear `localStorage` + `publyapp:cookie-consent` cookie. Reload `/`. Banner appears.
3. Click `Accept all`. Banner disappears. Reload — banner does not reappear. Inspect localStorage + cookie: both contain `status: 'accepted'`, both categories `true`, fresh `decidedAt`.
4. Repeat with `Reject all`. Both categories `false`.
5. Repeat with `Customize` → toggle analytics on, marketing off, save. `status: 'customized'`, categories match.
6. Click "Open cookie preferences" on `/cookies` page → dialog opens with current state.
7. Click "Cookie Preferences" in footer → dialog opens with current state.
8. From DevTools console: `window.__cookieConsent.hasConsented('analytics')` returns the correct boolean.
9. From DevTools console: subscribe to changes, toggle a category in the dialog, confirm the callback fires.
10. Bump `CONSENT_POLICY_VERSION` to 2, reload — banner reappears. Restore version 1 after test.
11. Manually edit cookie's `decidedAt` to >395 days ago, reload — banner reappears.
12. Tab through banner with keyboard → all buttons reachable, focus visible.
13. Open dialog with keyboard, escape closes it, focus returns to triggering element.

## Out of scope

- Marketing analytics integration itself (#375 — depends on this banner shipping)
- Privacy Policy / Cookie Policy content updates (separate content-review pass)
- Server-side consent enforcement for backend integrations
- IP-geo detection (locked to scope decision 2)
- 4th `functional` category (locked to scope decision 3)
- Floating re-access button (locked to scope decision 4)
- Real klaro!js or CookieYes integration (locked to scope decision 1)
- A11y audit beyond manual keyboard + screen reader smoke (could be follow-up if more rigor needed)

## Acceptance criteria

- [ ] `apps/front/src/components/cookie-consent/` directory created with all 6 files
- [ ] `<CookieConsentBanner>` mounted in `root.tsx`'s `<Layout>` behind `FEATURES.marketing.cookieConsent` (default `false`)
- [ ] Banner appears on first visit, doesn't reappear after Accept all / Reject all / Customize-and-save
- [ ] Three categories: `essential` (forced on), `analytics`, `marketing` (both default `false` until accepted)
- [ ] State persisted to BOTH localStorage and `publyapp:cookie-consent` cookie atomically
- [ ] Re-prompt triggers on `policy < CONSENT_POLICY_VERSION` OR `decidedAt` > 395 days
- [ ] `window.__cookieConsent.hasConsented(...)`, `.openPreferences()`, `.subscribe(...)` all functional, with TypeScript type augmentation
- [ ] Cookies page placeholder (`cookies-page.tsx:121-127`) wired to call `window.__cookieConsent?.openPreferences()`
- [ ] Footer "Cookie Preferences" link added (button entry in `HOME_FOOTER_LEGAL_LINKS`); `FooterLink` type updated to discriminated union
- [ ] Feature flag added to `flags.ts` (default `false`)
- [ ] Dark-mode + light-mode visual parity
- [ ] No layout shift at first paint (banner is `position: fixed`, render decision made synchronously)
- [ ] `just check-write` passes
- [ ] `just tsc-front` passes
- [ ] Manual smoke checklist completed by user before merge

## References

- Issue [#370](https://github.com/radandevist/publyapp-5/issues/370)
- PR #367 (marketing supporting pages — Phase 2 legal trio shipped `/cookies`)
- `apps/front/src/routes/marketing/cookies/cookies-page.tsx:121-127` (placeholder to wire up)
- `apps/front/src/routes/marketing/_data/legal-cookies.ts` (`COOKIES_INVENTORY`)
- `apps/front/src/lib/features/flags.ts` (FEATURES registry pattern)
- `apps/front/src/layouts/main/footer.tsx` (re-access entry point)
- `apps/front/src/root.tsx` (mount point)
- AGENTS.md → Frontend Coding Standards (MUI v6, `sx` prop, no Tailwind, arrow components, `<Image>` primitive)
- `docs/guides/marketing-surface-conventions.md` (motion canon, palette tokens)
- CNIL guidance: <https://www.cnil.fr/en/cookies-and-other-tracers> (13-month re-prompt cycle)
- EDPB consent guidelines 05/2020
