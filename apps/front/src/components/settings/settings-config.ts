import { themeConfig } from '#app/lib/mui/theme/theme-config.ts';

import type { SettingsState } from './types';

// ----------------------------------------------------------------------

export const SETTINGS_STORAGE_KEY: string = 'publyapp:app-settings';
// MUI boot needs a flat mode value, while Zustand stores the full settings
// object. Keeping this separate lets first paint and full settings both work.
export const COLOR_SCHEME_STORAGE_KEY: string = 'publyapp:color-scheme';

export const defaultSettings: SettingsState = {
	colorScheme: themeConfig.defaultMode,
	direction: themeConfig.direction,
	contrast: 'default',
	navLayout: 'vertical',
	primaryColor: 'preset5',
	navColor: 'integrate',
	compactLayout: false,
	fontSize: 16,
	fontFamily: themeConfig.fontFamily.primary,
	version: '#',
};
