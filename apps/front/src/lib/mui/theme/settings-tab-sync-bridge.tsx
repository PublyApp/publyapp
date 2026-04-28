import { useColorScheme } from '@mui/material/styles';
import { useEffect } from 'react';

import {
	type SettingsTabSyncMessage,
	settingsTabSync,
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
