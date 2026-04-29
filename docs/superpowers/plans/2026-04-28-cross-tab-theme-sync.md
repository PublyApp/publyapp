# Cross-Tab Theme Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the visible stale-theme flash when bringing a backgrounded tab to focus after the color scheme changed in another tab, and persist all settings (not just `mui-mode`) across reloads / new tabs.

**Architecture:** A `SettingsTabSync` class (mirrored on the existing `LocaleTabSync`) bridges tabs via `BroadcastChannel` + a `localStorage` signal-key fallback. A bridge component mounted inside `ThemeVarsProvider` wires the listener and a `visibilitychange`/`pageshow` rehydrater that synchronously sets `<html data-color-scheme>` before the first composited frame. Zustand's `settingsSlice` gains `persist` middleware (localStorage-backed) so non-MUI settings survive reloads.

**Tech Stack:** React 19, MUI v7 (`useColorScheme`, `ThemeVarsProvider`, CSS variables), Zustand v4 + `immer` + `persist`, BroadcastChannel API, React Router v7 (SSR-aware), TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-28-cross-tab-theme-sync-design.md`

**Note on tests:** This codebase has no frontend test runner today (AGENTS.md: "Frontend tests (when implemented)"). The spec's automated unit tests are aspirational and out of scope here — `LocaleTabSync` shipped without unit tests, and we mirror that. Each task gates on TypeScript (`just tsc-front`), Biome (`just check-write`), and the spec's manual acceptance flow.

---

## File Map

**Create:**
- `apps/front/src/lib/settings/settings-tab-sync.client.ts` — class + singleton; cross-tab bridge.
- `apps/front/src/lib/mui/theme/settings-tab-sync-bridge.tsx` — React bridge that mounts inside `ThemeVarsProvider` and wires listeners / rehydrate / safety-net effect.

**Modify:**
- `apps/front/src/components/settings/settings-config.ts` — change `SETTINGS_STORAGE_KEY` to namespaced value.
- `apps/front/src/lib/zustand/utils/middleware.ts` — add `combinedMiddlewaresWithSettingsPersist` factory using `localStorage` (separate from the existing query-param-backed `combinedMiddlewaresWithPersist`).
- `apps/front/src/lib/zustand/store.ts` — swap `combinedMiddlewares` → `combinedMiddlewaresWithSettingsPersist`.
- `apps/front/src/lib/zustand/features/settings.slice.ts` — export `subscribeToSettingsState(store)` for the broadcaster.
- `apps/front/src/lib/mui/theme/theme-provider.tsx` — render `<SettingsTabSyncBridge />` inside the `ThemeVarsProvider`.
- `apps/front/src/components/settings/drawer/settings-drawer.tsx` — remove the inline `system → settings.colorScheme` useEffect (now lives in the bridge as the safety-net effect, generalized to all modes).

---

## Task 1: Rename `SETTINGS_STORAGE_KEY` to namespaced value

**Files:**
- Modify: `apps/front/src/components/settings/settings-config.ts:7`

**Context:** The constant is currently `'app-settings'` and unused elsewhere (verified by grep — only its own declaration matches). Namespacing it under `publyapp:` matches the project's convention (e.g., `publyapp:i18n:locale` in `locale-tab-sync.client.ts:24-25`).

- [ ] **Step 1: Update the constant value**

In `apps/front/src/components/settings/settings-config.ts`, replace:

```ts
export const SETTINGS_STORAGE_KEY: string = 'app-settings';
```

with:

```ts
export const SETTINGS_STORAGE_KEY: string = 'publyapp:app-settings';
```

- [ ] **Step 2: Verify nothing else imports it under the old value**

Run: `grep -rn "SETTINGS_STORAGE_KEY\|'app-settings'" apps/front/src` (or use the editor's search).

Expected: matches only `settings-config.ts:7`. If anything else matches the literal `'app-settings'`, stop and report.

- [ ] **Step 3: Type-check**

Run: `just tsc-front`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/components/settings/settings-config.ts
git commit -m "refactor(front): namespace SETTINGS_STORAGE_KEY under publyapp:"
```

---

## Task 2: Add localStorage-backed persist middleware for settings slice

**Files:**
- Modify: `apps/front/src/lib/zustand/utils/middleware.ts`

**Context:** The existing `combinedMiddlewaresWithPersist` uses a query-param-backed storage adapter — wrong for settings (URL hygiene + cross-tab semantics). We add a new factory that uses real `localStorage`, scoped via `partialize` so only `settingsSlice.state` is persisted (not `openDrawer`/`canReset`, not other slices). It is SSR-safe via a `typeof window` guard returning a no-op storage on the server.

- [ ] **Step 1: Add imports and the new factory**

Open `apps/front/src/lib/zustand/utils/middleware.ts`. After the existing `combinedMiddlewaresWithPersist` definition (around line 71), append:

```ts
import { SETTINGS_STORAGE_KEY } from '#app/components/settings/settings-config.ts';

const noopStorage: StateStorage = {
	getItem: () => null,
	setItem: () => undefined,
	removeItem: () => undefined,
};

const getSettingsLocalStorage = (): StateStorage => {
	if (typeof window === 'undefined') {
		return noopStorage;
	}
	return window.localStorage;
};

export const combinedMiddlewaresWithSettingsPersist = <T>(
	initializer: StateCreator<T, [['zustand/immer', never]], []>,
) => {
	return devtools(
		persist(immer<T>(initializer), {
			name: SETTINGS_STORAGE_KEY,
			version: 1,
			storage: createJSONStorage<T>(() => {
				return getSettingsLocalStorage();
			}) as never,
			// Persist only settingsSlice.state — leave actions, openDrawer, canReset, and other slices untouched.
			partialize: (state) => {
				const settingsSlice = (state as unknown as {
					settingsSlice?: { state?: unknown };
				}).settingsSlice;

				return {
					settingsSlice: {
						state: settingsSlice?.state,
					},
				} as Partial<T>;
			},
			merge: (persistedState, currentState) => {
				return _.merge({}, currentState, persistedState);
			},
			// migrate: (persisted, fromVersion) => persisted, // intentional no-op until shape changes
		}),
	);
};
```

The `import` for `SETTINGS_STORAGE_KEY` should be moved to the top of the file with the other imports (Biome will reorder on `just check-write`).

- [ ] **Step 2: Type-check**

Run: `just tsc-front`

Expected: 0 errors.

- [ ] **Step 3: Lint/format**

Run: `just check-write`

Expected: no failures; auto-formatting may move the new import to the imports block.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/lib/zustand/utils/middleware.ts
git commit -m "feat(front): add localStorage-backed persist middleware for settings slice"
```

---

## Task 3: Wire the new persist middleware into the store

**Files:**
- Modify: `apps/front/src/lib/zustand/store.ts`

- [ ] **Step 1: Replace the middleware**

Open `apps/front/src/lib/zustand/store.ts`. Replace the entire file contents with:

```ts
import { create } from 'zustand';

import { subscribeToNavLayout } from './features/settings.slice';
import { getInitialStore, type RootState } from './slices';
import { combinedMiddlewaresWithSettingsPersist } from './utils/middleware';

export const useMainStore = create<RootState>()(
	combinedMiddlewaresWithSettingsPersist((...a) => {
		return getInitialStore(...a);
	}),
);

subscribeToNavLayout(useMainStore);
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`

Expected: 0 errors.

- [ ] **Step 3: Manual smoke check (settings persist across reload)**

Run dev: `just dev-front` (in another terminal `just dev-api` and `just dev-db` if not already running).

In the browser at `http://localhost:5050`:
1. Open the settings drawer.
2. Change `primaryColor` to a different preset.
3. Hard-reload (`Ctrl+Shift+R`).
4. Open the settings drawer again — the previously-selected preset should still be selected.
5. Open DevTools → Application → Local Storage → confirm key `publyapp:app-settings` exists with a JSON blob containing `state.settingsSlice.state.primaryColor`.

If anything fails, stop and report.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/lib/zustand/store.ts
git commit -m "feat(front): persist settings slice to localStorage"
```

---

## Task 4: Create `SettingsTabSync` skeleton (constructor, parsers, channel)

**Files:**
- Create: `apps/front/src/lib/settings/settings-tab-sync.client.ts`

**Context:** Mirror the structure of `apps/front/src/lib/i18n/locale-tab-sync.client.ts`. This task lays down the class and the static parsers; broadcast / listener / rehydrate are filled in by Tasks 5–7 so each commit is self-contained.

- [ ] **Step 1: Write the file with skeleton + parsers + channel helper**

Create `apps/front/src/lib/settings/settings-tab-sync.client.ts`:

```ts
import type { SettingsState } from '#app/components/settings/types.ts';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

type SettingsTabSyncMessage = {
	v: 1;
	settings: SettingsState;
	senderId: string;
	ts: number;
};

export type SettingsTabSyncResult = {
	stop: () => void;
};

export class SettingsTabSync {
	// Cross-tab settings sync (mirrored on LocaleTabSync):
	// - Primary: BroadcastChannel for instant in-process delivery on modern browsers.
	// - Fallback: localStorage signal key + `storage` event for compatibility.
	private static readonly _channelName = 'publyapp:app-settings';
	private static readonly _signalStorageKey = 'publyapp:app-settings:signal';

	private static _createSenderId(): string {
		try {
			if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
				return crypto.randomUUID();
			}
		} catch {
			// ignore
		}

		return `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
	}

	private static _isSettingsState(value: unknown): value is SettingsState {
		// Loose runtime shape check — message validators reject if not an object.
		return value !== null && typeof value === 'object';
	}

	private static _tryParseMessageFromUnknown(
		data: unknown,
	): SettingsTabSyncMessage | null {
		if (!data || typeof data !== 'object') {
			return null;
		}

		if ((data as { v?: unknown }).v !== 1) {
			return null;
		}

		const settings = (data as { settings?: unknown }).settings;
		const senderId = (data as { senderId?: unknown }).senderId;
		const ts = (data as { ts?: unknown }).ts;

		if (!SettingsTabSync._isSettingsState(settings)) {
			return null;
		}

		if (typeof senderId !== 'string' || senderId.length === 0) {
			return null;
		}

		if (typeof ts !== 'number') {
			return null;
		}

		return {
			v: 1,
			settings: settings as SettingsState,
			senderId,
			ts,
		};
	}

	private static _tryParseMessage(raw: string): SettingsTabSyncMessage | null {
		try {
			const parsed: unknown = JSON.parse(raw);
			return SettingsTabSync._tryParseMessageFromUnknown(parsed);
		} catch {
			return null;
		}
	}

	private _started = false;
	private _applyingRemote = false;
	private _lastAppliedTs = 0;
	private readonly _senderId = SettingsTabSync._createSenderId();
	private _channel: BroadcastChannel | null | undefined = undefined;

	public shouldBroadcast(): boolean {
		return !this._applyingRemote;
	}

	private _getChannel() {
		if (this._channel !== undefined) {
			return this._channel;
		}

		if (typeof window === 'undefined') {
			this._channel = null;
			return this._channel;
		}

		try {
			if ('BroadcastChannel' in window) {
				this._channel = new BroadcastChannel(SettingsTabSync._channelName);
				return this._channel;
			}
		} catch (error) {
			logger.debug('[settings-sync] BroadcastChannel init failed', { error });
		}

		this._channel = null;
		return this._channel;
	}
}

export const settingsTabSync = new SettingsTabSync();
```

- [ ] **Step 2: Type-check**

Run: `just tsc-front`

Expected: 0 errors.

- [ ] **Step 3: Lint/format**

Run: `just check-write`

Expected: no failures.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/lib/settings/settings-tab-sync.client.ts
git commit -m "feat(front): scaffold SettingsTabSync class (parsers + channel helper)"
```

---

## Task 5: Add `broadcastSettingsToTabs` method

**Files:**
- Modify: `apps/front/src/lib/settings/settings-tab-sync.client.ts`

- [ ] **Step 1: Add the broadcast method to the class**

Inside the `SettingsTabSync` class, after `_getChannel()`, add:

```ts
	// Broadcast a settings change to other tabs (best-effort; never throws).
	public broadcastSettingsToTabs(settings: SettingsState) {
		if (typeof window === 'undefined') {
			return;
		}

		const message: SettingsTabSyncMessage = {
			v: 1,
			settings,
			senderId: this._senderId,
			ts: Date.now(),
		};

		try {
			this._getChannel()?.postMessage(message);
		} catch (error) {
			logger.debug('[settings-sync] BroadcastChannel post failed', { error });
		}

		try {
			window.localStorage.setItem(
				SettingsTabSync._signalStorageKey,
				JSON.stringify(message),
			);
		} catch (error) {
			logger.debug('[settings-sync] localStorage write failed', { error });
		}
	}
```

- [ ] **Step 2: Type-check + lint**

Run: `just tsc-front && just check-write`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/lib/settings/settings-tab-sync.client.ts
git commit -m "feat(front): add broadcastSettingsToTabs to SettingsTabSync"
```

---

## Task 6: Add `initSettingsTabListener` (storage + channel)

**Files:**
- Modify: `apps/front/src/lib/settings/settings-tab-sync.client.ts`

**Context:** The listener accepts a callback that knows how to apply a remote settings state (and call MUI's `setMode`). Decoupling the apply logic keeps the class free of Zustand / MUI imports.

- [ ] **Step 1: Add private listener fields**

Inside the `SettingsTabSync` class, alongside the existing private fields (`_started`, `_applyingRemote`, `_lastAppliedTs`, `_senderId`, `_channel`), add:

```ts
	private _onStorageEvent: ((event: StorageEvent) => void) | null = null;
	private _onChannelMessage: ((event: MessageEvent) => void) | null = null;
```

- [ ] **Step 2: Add the init method**

After `broadcastSettingsToTabs` (added in Task 5), add:

```ts
	// Apply callback receives the validated remote message; the bridge component
	// supplies an implementation that updates Zustand and calls MUI's setMode.
	public initSettingsTabListener(
		applyRemote: (message: SettingsTabSyncMessage) => void,
	): SettingsTabSyncResult {
		if (typeof window === 'undefined') {
			return { stop: () => {} };
		}

		if (this._started) {
			return { stop: () => {} };
		}
		this._started = true;

		const channel = this._getChannel();

		const onRemoteMessage = (message: SettingsTabSyncMessage) => {
			if (message.senderId === this._senderId) {
				return; // echo
			}

			if (message.ts <= this._lastAppliedTs) {
				return; // stale
			}

			this._applyingRemote = true;
			try {
				applyRemote(message);
				this._lastAppliedTs = message.ts;
			} finally {
				this._applyingRemote = false;
			}
		};

		const onChannelMessage = (event: MessageEvent) => {
			const parsed = SettingsTabSync._tryParseMessageFromUnknown(event.data);
			if (!parsed) {
				return;
			}
			onRemoteMessage(parsed);
		};

		const onStorageEvent = (event: StorageEvent) => {
			if (
				event.key !== SettingsTabSync._signalStorageKey ||
				!event.newValue
			) {
				return;
			}

			const parsed = SettingsTabSync._tryParseMessage(event.newValue);
			if (!parsed) {
				return;
			}
			onRemoteMessage(parsed);
		};

		this._onStorageEvent = onStorageEvent;
		this._onChannelMessage = onChannelMessage;

		window.addEventListener('storage', onStorageEvent);
		channel?.addEventListener('message', onChannelMessage);

		const stop = () => {
			if (this._onStorageEvent) {
				try {
					window.removeEventListener('storage', this._onStorageEvent);
				} catch {
					// ignore
				}
				this._onStorageEvent = null;
			}

			if (this._onChannelMessage) {
				try {
					channel?.removeEventListener('message', this._onChannelMessage);
				} catch {
					// ignore
				}
				this._onChannelMessage = null;
			}

			try {
				channel?.close();
			} catch {
				// ignore
			}

			this._channel = undefined;
			this._started = false;
		};

		if (import.meta.hot) {
			import.meta.hot.dispose(() => {
				stop();
			});
		}

		return { stop };
	}
```

Also export the message type so the bridge component can type its callback. At the top of the file, immediately after the line:

```ts
type SettingsTabSyncMessage = {
	v: 1;
	settings: SettingsState;
	senderId: string;
	ts: number;
};
```

add:

```ts
export type { SettingsTabSyncMessage };
```

- [ ] **Step 3: Type-check + lint**

Run: `just tsc-front && just check-write`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/lib/settings/settings-tab-sync.client.ts
git commit -m "feat(front): add cross-tab listener to SettingsTabSync"
```

---

## Task 7: Add `initVisibilityRehydrate` (the flash fix)

**Files:**
- Modify: `apps/front/src/lib/settings/settings-tab-sync.client.ts`

**Context:** This is the core anti-flash mechanism. On `visibilitychange` from hidden → visible (and on `pageshow` for Safari bfcache), synchronously read the signal key and apply: first set `<html data-color-scheme>` directly so the next composited frame is correct, then call the apply callback to sync React/Zustand/MUI state.

- [ ] **Step 1: Add visibility listener fields**

Inside the class, next to `_onStorageEvent`/`_onChannelMessage`, add:

```ts
	private _onVisibility: (() => void) | null = null;
	private _onPageshow: ((event: PageTransitionEvent) => void) | null = null;
	private _visibilityStarted = false;
```

- [ ] **Step 2: Add the rehydrate init method**

After `initSettingsTabListener`, add:

```ts
	// Synchronously reapplies the latest scheme on visibility/pageshow, eliminating
	// the cached-compositor-frame flash when a backgrounded tab regains focus.
	public initVisibilityRehydrate(
		applyRemote: (message: SettingsTabSyncMessage) => void,
	): SettingsTabSyncResult {
		if (typeof window === 'undefined') {
			return { stop: () => {} };
		}

		if (this._visibilityStarted) {
			return { stop: () => {} };
		}
		this._visibilityStarted = true;

		const rehydrate = () => {
			if (document.visibilityState !== 'visible') {
				return;
			}

			let raw: string | null;
			try {
				raw = window.localStorage.getItem(
					SettingsTabSync._signalStorageKey,
				);
			} catch (error) {
				logger.debug('[settings-sync] localStorage read failed', { error });
				return;
			}

			if (!raw) {
				return;
			}

			const parsed = SettingsTabSync._tryParseMessage(raw);
			if (!parsed) {
				return;
			}

			if (parsed.senderId === this._senderId) {
				return; // self
			}

			if (parsed.ts <= this._lastAppliedTs) {
				return; // already applied
			}

			// Synchronous DOM mutation BEFORE any React render, so the next composited
			// frame uses the right CSS variables (data-color-scheme drives them).
			const colorScheme = parsed.settings.colorScheme;
			if (
				colorScheme &&
				document.documentElement.dataset.colorScheme !== colorScheme
			) {
				document.documentElement.dataset.colorScheme = colorScheme;
			}

			this._applyingRemote = true;
			try {
				applyRemote(parsed);
				this._lastAppliedTs = parsed.ts;
			} finally {
				this._applyingRemote = false;
			}
		};

		const onVisibility = () => {
			rehydrate();
		};
		const onPageshow = (_event: PageTransitionEvent) => {
			rehydrate();
		};

		this._onVisibility = onVisibility;
		this._onPageshow = onPageshow;

		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pageshow', onPageshow);

		const stop = () => {
			if (this._onVisibility) {
				try {
					document.removeEventListener('visibilitychange', this._onVisibility);
				} catch {
					// ignore
				}
				this._onVisibility = null;
			}
			if (this._onPageshow) {
				try {
					window.removeEventListener('pageshow', this._onPageshow);
				} catch {
					// ignore
				}
				this._onPageshow = null;
			}
			this._visibilityStarted = false;
		};

		if (import.meta.hot) {
			import.meta.hot.dispose(() => {
				stop();
			});
		}

		return { stop };
	}
```

- [ ] **Step 3: Type-check + lint**

Run: `just tsc-front && just check-write`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/lib/settings/settings-tab-sync.client.ts
git commit -m "feat(front): add visibility rehydrate to SettingsTabSync (flash fix)"
```

---

## Task 8: Add `subscribeToSettingsState` to the slice

**Files:**
- Modify: `apps/front/src/lib/zustand/features/settings.slice.ts`

**Context:** The broadcaster lives next to the existing `subscribeToNavLayout`. It fires whenever `settingsSlice.state` changes (immer keeps the reference stable when nothing changes, so the equality check is enough), and gates on `settingsTabSync.shouldBroadcast()` to suppress echoes when applying a remote update.

- [ ] **Step 1: Add the subscription**

At the bottom of `apps/front/src/lib/zustand/features/settings.slice.ts`, after `subscribeToNavLayout`, append:

```ts
import { settingsTabSync } from '#app/lib/settings/settings-tab-sync.client.ts';

export const subscribeToSettingsState = (store: typeof useMainStore) => {
	return store.subscribe((rootState, prevRootState) => {
		const next = rootState.settingsSlice.state;
		const prev = prevRootState.settingsSlice.state;
		if (next === prev) {
			return;
		}
		if (!settingsTabSync.shouldBroadcast()) {
			return;
		}
		settingsTabSync.broadcastSettingsToTabs(next);
	});
};
```

The `import` should be moved to the top with the other imports (`just check-write` will reorder). Note: importing `settings-tab-sync.client.ts` here means the module is pulled into both server and client bundles — this is safe because every public method on the class guards with `typeof window === 'undefined'`.

- [ ] **Step 2: Type-check + lint**

Run: `just tsc-front && just check-write`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/lib/zustand/features/settings.slice.ts
git commit -m "feat(front): broadcast settings changes to other tabs"
```

---

## Task 9: Create the bridge component

**Files:**
- Create: `apps/front/src/lib/mui/theme/settings-tab-sync-bridge.tsx`

**Context:** The bridge mounts inside `ThemeVarsProvider` so it can consume `useColorScheme()`. It wires:
1. The Zustand subscription that broadcasts local changes (Task 8).
2. The remote-message listener (Task 6) — applies remote state via `useMainStore.setState` and calls MUI's `setMode`.
3. The visibility rehydrater (Task 7) — same apply path, synchronous DOM update for the first frame.
4. A safety-net effect: keep `settings.state.colorScheme` aligned with MUI's resolved `mode` (generalizes the drawer's existing system-mode-only effect; that effect is removed in Task 11).

- [ ] **Step 1: Create the bridge file**

Create `apps/front/src/lib/mui/theme/settings-tab-sync-bridge.tsx`:

```tsx
import { useColorScheme } from '@mui/material/styles';
import { useEffect } from 'react';

import {
	settingsTabSync,
	type SettingsTabSyncMessage,
} from '#app/lib/settings/settings-tab-sync.client.ts';
import { subscribeToSettingsState } from '#app/lib/zustand/features/settings.slice.ts';
import { useMainStore } from '#app/lib/zustand/store.ts';

import type { ThemeColorScheme } from './types';

// ----------------------------------------------------------------------

// Wires cross-tab settings sync inside ThemeVarsProvider so we can consume setMode.
export const SettingsTabSyncBridge = () => {
	const { mode, systemMode, setMode } = useColorScheme();

	// Listener + visibility rehydrate + broadcast subscription.
	// Empty deps: setMode is stable from MUI; we want to init exactly once per mount.
	// biome-ignore lint/correctness/useExhaustiveDependencies: stable references; init once
	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		const applyRemote = (message: SettingsTabSyncMessage) => {
			useMainStore.setState((root) => {
				root.settingsSlice.state = message.settings;
			});

			const remoteScheme = message.settings.colorScheme as
				| ThemeColorScheme
				| undefined;
			if (remoteScheme && remoteScheme !== mode) {
				setMode(remoteScheme);
			}
		};

		const listener = settingsTabSync.initSettingsTabListener(applyRemote);
		const rehydrate = settingsTabSync.initVisibilityRehydrate(applyRemote);
		const unsubBroadcast = subscribeToSettingsState(useMainStore);

		return () => {
			listener.stop();
			rehydrate.stop();
			unsubBroadcast();
		};
	}, []);

	// Safety net: keep settings.state.colorScheme aligned with MUI's resolved mode
	// (covers system-mode resolution and any drift from external setMode calls).
	// Uses getState() so the effect re-runs only when MUI's mode/systemMode changes,
	// not on every settings change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: store read via getState() is intentional
	useEffect(() => {
		const resolved =
			mode === 'system' ? systemMode : (mode as ThemeColorScheme | undefined);
		if (!resolved) {
			return;
		}
		const slice = useMainStore.getState().settingsSlice;
		if (resolved === slice.state.colorScheme) {
			return;
		}
		slice.setState({ colorScheme: resolved });
	}, [mode, systemMode]);

	return null;
};
```

- [ ] **Step 2: Type-check + lint**

Run: `just tsc-front && just check-write`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/lib/mui/theme/settings-tab-sync-bridge.tsx
git commit -m "feat(front): add SettingsTabSyncBridge component"
```

---

## Task 10: Mount the bridge inside `MuiThemeProvider`

**Files:**
- Modify: `apps/front/src/lib/mui/theme/theme-provider.tsx`

- [ ] **Step 1: Render the bridge**

Replace the contents of `apps/front/src/lib/mui/theme/theme-provider.tsx` with:

```tsx
import CssBaseline from '@mui/material/CssBaseline';
import {
	type ThemeProviderProps as MuiThemeProviderProps,
	ThemeProvider as ThemeVarsProvider,
} from '@mui/material/styles';

import { useSettingsContext } from '#app/hooks/use-settings-context.ts';

import { useTranslate } from '../../../hooks/use-translate';
import { createTheme } from './create-theme';
import { SettingsTabSyncBridge } from './settings-tab-sync-bridge';
import type { ThemeOptions } from './types';

// ----------------------------------------------------------------------

export type ThemeProviderProps = Partial<MuiThemeProviderProps> & {
	themeOverrides?: ThemeOptions;
};

export const MuiThemeProvider = ({
	themeOverrides,
	children,
	...other
}: ThemeProviderProps) => {
	const { currentLang } = useTranslate();

	const settings = useSettingsContext();

	const theme = createTheme({
		settingsState: settings.state,
		localeComponents: currentLang?.systemValue,
		themeOverrides,
	});

	return (
		<ThemeVarsProvider disableTransitionOnChange theme={theme} {...other}>
			<CssBaseline />
			<SettingsTabSyncBridge />
			{children}
		</ThemeVarsProvider>
	);
};
```

- [ ] **Step 2: Type-check + lint**

Run: `just tsc-front && just check-write`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/lib/mui/theme/theme-provider.tsx
git commit -m "feat(front): mount SettingsTabSyncBridge inside ThemeVarsProvider"
```

---

## Task 11: Remove the drawer's now-redundant system-mode effect

**Files:**
- Modify: `apps/front/src/components/settings/drawer/settings-drawer.tsx:371-376`

**Context:** The bridge's safety-net effect (Task 9, second `useEffect`) generalizes the drawer's system-mode-only effect to all modes. Leaving both creates double writes when MUI's `mode` changes. Remove the drawer's effect.

- [ ] **Step 1: Remove the effect and its `useEffect` import if unused**

In `apps/front/src/components/settings/drawer/settings-drawer.tsx`, locate this block (currently lines 371–376):

```tsx
	// biome-ignore lint/correctness/useExhaustiveDependencies: code from template leave as is for now
	useEffect(() => {
		if (mode === 'system' && systemMode) {
			settings.setState({ colorScheme: systemMode });
		}
	}, [mode, systemMode]);
```

Delete it.

If `useEffect` is no longer used elsewhere in the file (check the imports / remaining body), remove `useEffect` from the `react` import on line 10. Currently:

```tsx
import { useCallback, useEffect } from 'react';
```

After deletion, only `useCallback` is still used in `handleReset` (line 378), so reduce to:

```tsx
import { useCallback } from 'react';
```

The destructured `systemMode` from `useColorScheme()` (line 369) is also no longer used in the file after this deletion. Remove it from the destructure:

```tsx
	const { mode, setMode } = useColorScheme();
```

- [ ] **Step 2: Type-check + lint**

Run: `just tsc-front && just check-write`

Expected: 0 errors. Biome may flag any remaining unused imports — fix per its suggestion.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/components/settings/drawer/settings-drawer.tsx
git commit -m "refactor(front): drop drawer system-mode effect (now in bridge)"
```

---

## Task 12: Manual acceptance verification

**Files:** none (testing only)

**Context:** Walk through every acceptance criterion from the spec. Run from a clean dev environment (`just dev-db`, `just dev-api`, `just dev-front`) at `http://localhost:5050`.

- [ ] **Step 1: Two-tab color scheme — no flash**

1. Open two browser tabs to the app.
2. In tab A, open the settings drawer and toggle dark mode.
3. Click on tab B (do **not** reload).
4. **Expected:** the page is already in the new scheme, no visible flash. The cached compositor frame is corrected by the synchronous `data-color-scheme` write before first paint.

- [ ] **Step 2: Two-tab full settings sync**

In tab A, change `primaryColor` (e.g., to `preset3`). Switch to tab B.
**Expected:** the primary color is the new value (visible in any primary-colored UI: buttons, focus rings, drawer toggles).

Repeat for `fontFamily` and `fontSize`. Both should propagate.

- [ ] **Step 3: Reload persistence**

In tab A, change several settings (color scheme, primary color, font family). Hard-reload (`Ctrl+Shift+R`).
**Expected:** all settings preserved.

- [ ] **Step 4: New-tab inheritance**

With settings customized, open a new tab to the app.
**Expected:** the new tab loads with the customized settings (not defaults).

- [ ] **Step 5: Reset propagation**

In tab A, click the drawer's "Reset all" button. Switch to tab B.
**Expected:** tab B reverts to defaults.

- [ ] **Step 6: Safari bfcache (optional but recommended)**

In Safari (if available): with the app open, click an internal link to navigate, then click Back.
**Expected:** bfcache restore renders the correct scheme; no flash. The `pageshow` listener handles this case.

- [ ] **Step 7: SSR cold-load sanity**

Hard-reload tab A with DevTools console open.
**Expected:** no React hydration warnings, no "InitColorSchemeScript" mismatch warnings, no FOUC.

- [ ] **Step 8: DevTools storage layout sanity**

DevTools → Application → Local Storage. Three keys should be present:
- `mui-mode` (owned by MUI)
- `publyapp:app-settings` (Zustand persist; contains the full slice state)
- `publyapp:app-settings:signal` (the broadcast signal envelope: `{v, settings, senderId, ts}`)

- [ ] **Step 9: If everything passes, the branch is ready**

```bash
git status
```

Expected: clean working tree, all 11 prior commits ahead of `feat/280-staff-users-table-full-upgrade` (or `main`, whichever the branch was forked from).

If anything failed, capture which step and the observed behavior, and report back before opening a PR.

---

## Self-Review Notes

**Spec coverage:**
- Goal: kill flash → Tasks 7 (visibility rehydrate) + 9 (bridge wiring) + 12.1 (verification).
- Goal: persist all settings → Tasks 1, 2, 3.
- Goal: cross-tab sync of all settings → Tasks 4, 5, 6, 8, 9.
- MUI reconciliation invariant + safety-net effect → Task 9; drawer cleanup → Task 11.
- bfcache + visibility → Task 7; verified Task 12.6.
- Storage layout (3 keys) → Tasks 1, 2, 4 (signal key); verified Task 12.8.
- Echo / stale guards → Tasks 6, 7.
- HMR cleanup → Tasks 6, 7.
- SSR safety → Tasks 2 (no-op storage), 4 (`typeof window` in `_getChannel`), 6/7 (early returns); verified Task 12.7.

**Type/name consistency:** `SettingsTabSyncMessage`, `SettingsTabSyncResult`, `settingsTabSync`, `settingsTabSync.shouldBroadcast()`, `broadcastSettingsToTabs(state)`, `initSettingsTabListener(applyRemote)`, `initVisibilityRehydrate(applyRemote)`, `subscribeToSettingsState(store)`, `SettingsTabSyncBridge` — used identically across Tasks 4–11.

**Out-of-scope (deliberate):**
- Automated unit tests — no frontend test runner; mirrors how `LocaleTabSync` shipped. Suggest as a future task once a runner lands.
- Server-side preferences API.
- `useChangeColorScheme()` extraction (mentioned in spec as "consider", not required).
