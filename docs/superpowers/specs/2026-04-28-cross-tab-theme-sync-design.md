# Cross-Tab Theme Sync — Eliminate Stale-Theme Flash on Tab Activation

## Context
When multiple tabs are open and the user changes the color scheme in tab A,
tab B eventually shows the new scheme — but the handoff is visibly "snappy":
when the inactive tab is brought back to focus, the old scheme flashes briefly
before the new one settles in.

The current implementation has two shortcomings that contribute:

1. **Paint-timing flash on tab activation.** MUI v7's `ThemeVarsProvider`
   listens for `storage` events and updates `<html data-color-scheme>` in
   background tabs, but the browser composites the last-painted (stale)
   frame for ~1+ frames when the tab regains visibility. The DOM is correct,
   the visible frame is not.
2. **Settings state desync.** The Zustand `settingsSlice`
   (`apps/front/src/lib/zustand/features/settings.slice.ts`) is
   in-memory only — `combinedMiddlewares` does not include `persist` and there
   is no cross-tab listener for non-MUI settings. As a side effect, settings
   other than `colorScheme` (`primaryColor`, `contrast`, `direction`,
   `fontFamily`, `fontSize`, `navLayout`, `navColor`, `compactLayout`) are
   lost on reload and never propagate to other tabs.

The locale tab sync introduced in
`apps/front/src/lib/i18n/locale-tab-sync.client.ts` is a clean, vetted pattern
in this codebase (BroadcastChannel + localStorage fallback, versioned
messages, sender-id echo guard). The settings sync should mirror it.

## Goals
- Changing any setting (color scheme, primary color, contrast, direction,
  font family/size, nav layout/color, compact layout) in one tab applies in
  all other open tabs without refresh.
- When a backgrounded tab regains visibility, the **first composited frame**
  uses the latest color scheme (no visible flash).
- Settings persist to localStorage and survive reloads and new tabs.
- Existing SSR / hydration behavior is unchanged. `InitColorSchemeScript`
  continues to handle initial-paint correctness on cold loads.

## Non-Goals
- Server-side persistence of settings (no per-user preferences API).
- Cross-device sync.
- Replacing MUI's own `mui-mode` localStorage key. We bridge to it via
  `setMode`, we do not own it.
- The "hide content during transition" anti-flash trick (rejected: introduces
  its own visible artifact and SSR risk).

## Approach
Three coordinated changes, each isolated:

### 1. Persist `settingsSlice` to localStorage
- Add Zustand `persist` middleware to the settings slice via a new
  `combinedMiddlewaresWithSettingsPersist` factory (or extend the existing
  `combinedMiddlewares` to optionally include persist for selected slices),
  using the existing `SETTINGS_STORAGE_KEY` constant
  (`apps/front/src/components/settings/settings-config.ts:7`) renamed to
  `publyapp:app-settings` to match the project's namespacing convention.
- `partialize` to persist only `state` (omit `openDrawer`, `canReset`).
- `version: 1` with a no-op `migrate` callback for future shape changes.
- The persist middleware uses `localStorage` (override the default
  query-param-backed `getStorage()` adapter — query-param storage is wrong
  for settings, both for cross-tab semantics and for URL hygiene).

### 2. New `SettingsTabSync` class — cross-tab bridge
- File: `apps/front/src/lib/settings/settings-tab-sync.client.ts`
- Mirrored on `LocaleTabSync` shape: singleton, versioned message envelope,
  sender-id + timestamp echo guard, `BroadcastChannel` primary +
  `localStorage` mirror fallback, HMR cleanup, all I/O guarded.
- Public API:
  - `broadcastSettingsToTabs(state: SettingsState)`
  - `initSettingsTabListener({ store, setMode })`
  - `initVisibilityRehydrate({ store, setMode })`
  - `shouldBroadcast(): boolean`
- The broadcaster posts on `BroadcastChannel('publyapp:app-settings')` and
  writes a signal-only mirror entry at
  `localStorage['publyapp:app-settings:signal']`. The signal key is separate
  from Zustand's persist key so the on-disk state schema and the wire
  message envelope can evolve independently.

### 3. Wire listeners and broadcaster
- **Listener init**: a small client-only bridge component
  (e.g., `SettingsTabSyncBridge`) rendered under `ThemeVarsProvider` in
  `apps/front/src/lib/mui/theme/theme-provider.tsx`, so it can call
  `useColorScheme()` and pass `setMode` into the listeners. Inside a
  `useEffect`, it calls `initSettingsTabListener` and
  `initVisibilityRehydrate` once and cleans up on unmount.
- **Broadcaster**: new Zustand subscription
  `subscribeToSettingsState(store)` next to the existing
  `subscribeToNavLayout` in `settings.slice.ts`. Fires
  `settingsTabSync.broadcastSettingsToTabs(state)` on any change to
  `settingsSlice.state`, gated on `settingsTabSync.shouldBroadcast()`.

## Message Format
```ts
type SettingsTabSyncMessage = {
  v: 1;
  settings: SettingsState;
  senderId: string;   // crypto.randomUUID() per tab
  ts: number;         // Date.now() at write time
};
```
Validation (`_tryParseMessage`, `_tryParseMessageFromUnknown`) silently
rejects unknown versions, missing fields, and malformed JSON.

## Loop Prevention and Conflict Resolution
- **Echo guard**: `senderId === self` → ignore.
- **Stale guard**: incoming `ts <= _lastAppliedTs` → ignore.
- **Self-broadcast suppression**: `_applyingRemote` flag wraps the local
  apply path; the broadcaster subscription consults `shouldBroadcast()`
  before posting.
- **Concurrent edits**: last-write-wins by `ts`. Tabs converge because each
  tab replays the other's broadcast.

## Visibility Rehydrate (the flash fix)
`initVisibilityRehydrate` registers two listeners:
- `document.addEventListener('visibilitychange', onVisible)`
- `window.addEventListener('pageshow', onVisible)` — covers Safari bfcache.

`onVisible` runs synchronously when the tab becomes visible and:
1. Bails if `document.visibilityState !== 'visible'`.
2. Reads `localStorage['publyapp:app-settings:signal']`, parses with the
   shared validator, bails if `parsed.ts <= _lastAppliedTs`.
3. **Synchronously** sets
   `document.documentElement.dataset.colorScheme = parsed.settings.colorScheme`
   before any React render. The next composited frame uses the right CSS
   variables.
4. Then runs the same apply path as the storage/channel listener:
   `_applyingRemote = true; store.setState(...); setMode(...);
   _applyingRemote = false`.
5. Updates `_lastAppliedTs`.

The synchronous `dataset.colorScheme` write is what eliminates the visible
flash: the attribute selector that drives every CSS variable is correct
before the browser composites frame 1.

## MUI Reconciliation Invariant
- **Local mutation** of `colorScheme` always pairs `settings.setState({colorScheme})`
  with `setMode(colorScheme)`. Both existing call sites already do this:
  - `apps/front/src/components/settings/drawer/settings-drawer.tsx:111-114`
  - `apps/front/src/layouts/components/colorscheme-popover.tsx:45-49`
  Consider extracting `useChangeColorScheme()` to enforce the pairing.
- **Remote mutation** received by the listener applies state to Zustand AND
  calls `setMode`. MUI's own `mui-mode` localStorage stays in sync across
  tabs through us, even though MUI itself does not see a cross-tab event for
  programmatic changes from another tab.
- **Safety net**: in the bridge component, a
  `useEffect(() => { if (mode !== settings.state.colorScheme)
  settings.setState({colorScheme: mode}); }, [mode])` generalizes the
  drawer's existing system-mode-only effect, catching any drift.

## Storage Layout
| Key | Owner | Purpose |
|---|---|---|
| `mui-mode` | MUI | Boot-time `<html data-color-scheme>` via `InitColorSchemeScript`. Untouched. |
| `publyapp:app-settings` | Zustand `persist` | Source of truth for full `SettingsState`. Survives reloads / new tabs. |
| `publyapp:app-settings:signal` | `SettingsTabSync` | Cross-tab signal envelope (storage-event fallback for non-`BroadcastChannel` browsers). |

## Edge Cases
- **SSR / hydration**: all sync code in `*.client.ts`; listener init gated
  on `useEffect` + `typeof window !== 'undefined'`. `InitColorSchemeScript`
  continues to handle cold-load correctness.
- **bfcache (Safari)**: `pageshow` listener catches restores where
  `visibilitychange` does not fire.
- **`onReset`**: handled uniformly because it triggers `setState`; the
  broadcaster subscription fires for it.
- **`mode === 'system'`**: drawer's existing effect resolves system →
  scheme. Broadcasts carry resolved scheme, not `'system'`. Two tabs on
  different OS themes will not fight (an explicit toggle in tab A overrides
  tab B's system preference, by design — same model as locale sync).
- **`BroadcastChannel` unavailable**: storage-event fallback covers it.
- **HMR**: dispose channel + listeners on `import.meta.hot.dispose`.
- **MUI's own storage listener**: still runs, harmless. `_lastAppliedTs`
  guards prevent state-loop weirdness.
- **Persist version migration**: `version: 1` with no-op `migrate`. Bump
  cleanly when `SettingsState` shape changes.

## Acceptance Criteria
- Switching themes in one tab does not produce a visible stale-theme flash
  when returning to another already-open tab.
- Inactive tabs pick up the latest scheme before or at first visible paint
  when possible (synchronous `data-color-scheme` write on
  `visibilitychange`).
- Settings (colorScheme + all other drawer-controlled fields) persist across
  reloads and new tabs.
- No regressions in SSR or hydration behavior; no new console warnings.
- Existing locale-tab-sync continues to work unchanged.

## Test Plan
**Automated**
- Unit tests for `SettingsTabSync` static parsers: valid v1 message, missing
  fields, wrong version, malformed JSON.
- Unit tests for `_lastAppliedTs` ordering: stale messages ignored, echo via
  `senderId === self` ignored.
- Persist roundtrip: write state, recreate store, verify `state` restored
  and `openDrawer` reset to default (partialize correctness).

**Manual**
1. Two tabs open. Toggle dark/light in tab A. Bring tab B to focus → no
   flash, scheme matches.
2. Change `primaryColor`/`fontFamily` in tab A → reflected in tab B on next
   focus.
3. Reload tab B → all settings persist (was broken before).
4. Open a fresh new tab → inherits persisted settings.
5. `onReset` in tab A → tab B reverts.
6. Safari: navigate away (link or back) and back → bfcache restore, no
   flash, settings correct.
7. SSR cold load: no console errors, no hydration warnings, no FOUC.

## Implementation Notes
- Client-only files: `apps/front/src/lib/settings/settings-tab-sync.client.ts`,
  bridge component co-located with `theme-provider.tsx`.
- Storage adapter: persist middleware must use `localStorage` directly, not
  the existing query-param-backed `getStorage()` adapter in
  `apps/front/src/lib/zustand/utils/middleware.ts`.
- Resilience: all `BroadcastChannel` and `localStorage` operations guarded
  with try/catch (mirroring `LocaleTabSync`).
- After implementation, run `just check-write && just tsc-front` per
  AGENTS.md before committing.
