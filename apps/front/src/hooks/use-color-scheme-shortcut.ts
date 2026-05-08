import { type SupportedColorScheme, useColorScheme } from '@mui/material';
import { useEffect, useRef } from 'react';

import { useSettingsContext } from './use-settings-context.ts';

// ----------------------------------------------------------------------

const matchesShortcut = (event: KeyboardEvent): boolean => {
	if (event.key.toLowerCase() !== 'j') return false;
	if (event.shiftKey || event.altKey) return false;
	return event.ctrlKey || event.metaKey;
};

// Binds Ctrl+J (Windows/Linux) and Cmd+J (macOS) to a binary light/dark toggle.
// `system` resolves to its current effective mode and flips the opposite way.
export const useColorSchemeShortcut = () => {
	const settings = useSettingsContext();
	const { mode, systemMode, setMode } = useColorScheme();

	const stateRef = useRef({ mode, systemMode, setMode, settings });
	stateRef.current = { mode, systemMode, setMode, settings };

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!matchesShortcut(event)) return;
			event.preventDefault();
			const {
				mode: currentMode,
				systemMode: currentSystemMode,
				setMode: applyMode,
				settings: settingsCtx,
			} = stateRef.current;
			const resolvedMode =
				currentMode === 'system' ? (currentSystemMode ?? 'dark') : currentMode;
			const nextMode: SupportedColorScheme =
				resolvedMode === 'dark' ? 'light' : 'dark';
			applyMode(nextMode);
			settingsCtx.setState({ colorScheme: nextMode });
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, []);
};
