import type { Components, Theme } from '@mui/material/styles';
import { createTheme as createMuiTheme } from '@mui/material/styles';

import type { SettingsState } from '@/front/components/settings';

import { components } from './core/components';
import { customShadows } from './core/custom-shadows';
import { mixins } from './core/mixins';
import { palette } from './core/palette';
import { shadows } from './core/shadows';
import { typography } from './core/typography';
import { themeConfig } from './theme-config';
import type { ThemeOptions } from './types';
import {
	updateComponentsWithSettings,
	updateCoreWithSettings,
} from './with-settings';

// ----------------------------------------------------------------------

export const baseTheme: ThemeOptions = {
	colorSchemes: {
		light: {
			palette: palette.light,
			shadows: shadows.light,
			customShadows: customShadows.light,
		},
		dark: {
			palette: palette.dark,
			shadows: shadows.dark,
			customShadows: customShadows.dark,
		},
	},
	mixins,
	components,
	typography,
	shape: { borderRadius: 6 }, // Reduced from 8 for a sharper, more modern look (Metronic-inspired)
	direction: themeConfig.direction,
	cssVariables: themeConfig.cssVariables,
	defaultColorScheme: themeConfig.defaultMode,
};

// ----------------------------------------------------------------------

type CreateThemeProps = {
	settingsState?: SettingsState;
	themeOverrides?: ThemeOptions;
	localeComponents?: { components?: Components<Theme> };
};

export function createTheme({
	settingsState,
	themeOverrides = {},
	localeComponents = {},
}: CreateThemeProps = {}): Theme {
	// Update core theme settings
	const updatedCore = settingsState
		? updateCoreWithSettings(baseTheme, settingsState)
		: baseTheme;

	// Update component settings
	const updatedComponents = settingsState
		? updateComponentsWithSettings(components, settingsState)
		: {};

	// Create and return the final theme
	const theme = createMuiTheme(
		updatedCore,
		updatedComponents,
		localeComponents,
		themeOverrides,
	);

	return theme;
}
