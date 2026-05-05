import CssBaseline from '@mui/material/CssBaseline';
import {
	type ThemeProviderProps as MuiThemeProviderProps,
	ThemeProvider as ThemeVarsProvider,
} from '@mui/material/styles';

import { COLOR_SCHEME_STORAGE_KEY } from '#app/components/settings/settings-config.ts';
import { useSettingsContext } from '#app/hooks/use-settings-context.ts';

import { useTranslate } from '../../../hooks/use-translate';
import { createTheme } from './create-theme';
import { SettingsTabSyncBridge } from './settings-tab-sync-bridge';
import { themeConfig } from './theme-config';
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
		<ThemeVarsProvider
			// Match InitColorSchemeScript so server boot, first paint, and the
			// hydrated MUI provider all read the same flat color-scheme key.
			defaultMode={themeConfig.defaultMode}
			disableTransitionOnChange
			modeStorageKey={COLOR_SCHEME_STORAGE_KEY}
			theme={theme}
			{...other}
		>
			<CssBaseline />
			<SettingsTabSyncBridge />
			{children}
		</ThemeVarsProvider>
	);
};
