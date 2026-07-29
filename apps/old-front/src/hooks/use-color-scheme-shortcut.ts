import { type SupportedColorScheme, useColorScheme } from '@mui/material';
import { useEffect } from 'react';

import { useSettingsContext } from './use-settings-context.ts';

// ----------------------------------------------------------------------

const isEditableTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	if (target.isContentEditable) {
		return true;
	}
	const tagName = target.tagName;
	return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
};

const matchesShortcut = (event: KeyboardEvent): boolean => {
	if (event.defaultPrevented || event.repeat || event.isComposing) {
		return false;
	}
	if (event.shiftKey || event.altKey) {
		return false;
	}
	if (event.key.toLowerCase() !== 'j') {
		return false;
	}
	if (isEditableTarget(event.target)) {
		return false;
	}
	return event.ctrlKey || event.metaKey;
};

// Binds Ctrl+J (Windows/Linux) and Cmd+J (macOS) to a binary light/dark
// toggle. `system` mode is not enabled in `theme-config.ts`, so we treat
// any non-`dark` resolved value as `light` and flip from there.
export const useColorSchemeShortcut = () => {
	const settings = useSettingsContext();
	const { mode, systemMode, setMode } = useColorScheme();

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!matchesShortcut(event)) {
				return;
			}
			event.preventDefault();
			const resolvedMode =
				mode === 'system' ? (systemMode ?? 'dark') : (mode ?? 'light');
			const nextMode: SupportedColorScheme =
				resolvedMode === 'dark' ? 'light' : 'dark';
			setMode(nextMode);
			settings.setState({ colorScheme: nextMode });
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [mode, systemMode, setMode, settings]);
};
