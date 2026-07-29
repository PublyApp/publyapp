import { useColorScheme } from '@mui/material/styles';
import { useEffect } from 'react';

import { COLOR_SCHEME_STORAGE_KEY } from '#app/components/settings/settings-config.ts';
import type { SettingsSyncSnapshot } from '#app/lib/settings/settings-sync-state.client.ts';
import { settingsTabSync } from '#app/lib/settings/settings-tab-sync.client.ts';
import { useMainStore } from '#app/lib/zustand/store.ts';

import type { ThemeColorScheme } from './types';

// ----------------------------------------------------------------------

const writeColorSchemeToStorage = (colorScheme: ThemeColorScheme) => {
	try {
		// Keep MUI's boot-time flat mode key aligned with the full settings store.
		// This is what prevents reloads/new tabs from starting in the wrong scheme.
		window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorScheme);
	} catch {
		// localStorage may be unavailable in private or restricted contexts.
	}
};

// Wires cross-tab settings sync inside ThemeVarsProvider so we can consume setMode.
export const SettingsTabSyncBridge = () => {
	const { mode, systemMode, setMode } = useColorScheme();

	// Listener + visibility rehydrate.
	// Empty deps: setMode is stable from MUI; we want to init exactly once per mount.
	useEffect(
		() => {
			if (typeof window === 'undefined') {
				return;
			}

			const getCurrentSnapshot = (): SettingsSyncSnapshot => {
				const slice = useMainStore.getState().settingsSlice;
				// The sync adapter compares complete snapshots, so include both the
				// settings payload and ordering metadata from the live Zustand store.
				return {
					state: slice.state,
					revision: slice.revision,
					updatedAt: slice.updatedAt,
					syncId: slice.syncId,
				};
			};

			const applySnapshot = (snapshot: SettingsSyncSnapshot) => {
				// Remote snapshots already passed validation before this point. Assign
				// the sanitized snapshot wholesale so tabs converge exactly.
				useMainStore.setState((root) => {
					root.settingsSlice.state = snapshot.state;
					root.settingsSlice.revision = snapshot.revision;
					root.settingsSlice.updatedAt = snapshot.updatedAt;
					root.settingsSlice.syncId = snapshot.syncId;
				});

				const remoteScheme = snapshot.state.colorScheme as
					| ThemeColorScheme
					| undefined;
				if (remoteScheme) {
					writeColorSchemeToStorage(remoteScheme);
					// MUI owns CSS variable mode application. Updating it here keeps the
					// provider state aligned with the raw <html> data attribute write.
					setMode(remoteScheme);
				}
			};

			const options = {
				getCurrentSnapshot,
				applySnapshot,
			};
			const listener = settingsTabSync.initSettingsStorageListener(options);
			const rehydrate = settingsTabSync.initVisibilityRehydrate(options);

			return () => {
				listener.stop();
				rehydrate.stop();
			};
		},
		// oxlint-disable-next-line react/exhaustive-deps -- bridge initializes once and reads current store state through stable callbacks
		[],
	);

	// Safety net: keep settings.state.colorScheme aligned with MUI's resolved mode
	// (covers system-mode resolution and any drift from external setMode calls).
	// Uses getState() so the effect re-runs only when MUI's mode/systemMode changes,
	// not on every settings change.
	useEffect(() => {
		const resolved =
			mode === 'system' ? systemMode : (mode as ThemeColorScheme | undefined);
		if (!resolved) {
			return;
		}
		if (typeof window !== 'undefined') {
			writeColorSchemeToStorage(resolved);
		}
		const slice = useMainStore.getState().settingsSlice;
		if (resolved === slice.state.colorScheme) {
			return;
		}
		// If another MUI caller changes mode directly, fold that resolved value
		// back into durable settings so reloads and other tabs see the same scheme.
		slice.setState({ colorScheme: resolved });
	}, [mode, systemMode]);

	return null;
};
