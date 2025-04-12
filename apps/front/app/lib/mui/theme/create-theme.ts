import {
	createTheme as createMuiTheme,
	type Components,
	type Theme,
} from '@mui/material/styles';

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
	shape: { borderRadius: 8 },
	direction: themeConfig.direction,
	cssVariables: themeConfig.cssVariables,
	defaultColorScheme: themeConfig.defaultMode,
};

// ----------------------------------------------------------------------

type CreateThemeProps = {
	// biome-ignore lint/suspicious/noExplicitAny: fix later
	settingsState?: any; // SettingsState; // TODO: fix type later
	themeOverrides?: ThemeOptions;
	localeComponents?: { components?: Components<Theme> };
};

export const createTheme = ({
	settingsState,
	themeOverrides = {},
	localeComponents = {},
}: CreateThemeProps = {}): Theme => {
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
};
