# Sync Language Preference Across Browser Tabs (Issue #152)

## Context
Today, changing the app language only affects the current tab. Other open tabs
remain on the old language until refreshed or changed manually.

The frontend uses i18next and persists the locale via:
- Cookie: `LOCALE_COOKIE_KEY` (`publyapp-locale`) or
- Query param: `lng`

Those persistence mechanisms are necessary for SSR and reloads, but they do not
provide a cross-tab notification mechanism.

## Goals
- Changing language in one tab updates all other open tabs without refresh.
- Works for authenticated and unauthenticated users.
- Sync only the app locale (not other preferences).

## Non-Goals
- Cross-device locale sync (requires backend user preference storage).
- A single “source of truth” preference service on the server.

## Approach (Hybrid)
Use a client-side cross-tab “event bus”:
1. Primary: `BroadcastChannel` for modern browsers.
2. Fallback: `localStorage` + `storage` event for compatibility.

The bus only transports “locale changed” messages; each receiving tab applies
the locale by calling `i18n.changeLanguage(locale)`.

Existing behavior remains:
- The current tab still persists locale to cookie or query param.
- Day.js + Zod locales are updated via the existing `languageChanged` handler.

## Message Format
JSON message (v1):
```json
{
  "v": 1,
  "locale": "en",
  "senderId": "uuid-or-random",
  "ts": 1710000000000
}
```

## Loop Prevention
- Each tab has a `senderId`; messages from the same `senderId` are ignored.
- When applying a remote change, the receiving tab suppresses re-broadcasting
  for that change (prevents ping-pong loops).

## Implementation Notes
- Client-only implementation: `apps/front/src/lib/i18n/locale-tab-sync.client.ts` (helper) + `apps/front/src/lib/i18n/init-i18n.client.ts` (wiring)
- Initialization point: called once from `initI18nOnClient()` after i18next init.
- Validation/normalization: incoming values are normalized via `getCorrectLocale`.
- Resilience: all `BroadcastChannel` and `localStorage` operations are guarded
  with try/catch to avoid breaking the app in restricted environments.

## Acceptance Criteria
- Changing language in tab A updates tab B (and other tabs) immediately.
- No refresh required in other tabs.
- Works for both authenticated and unauthenticated users.
