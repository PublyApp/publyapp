import CssBaseline from '@mui/material/CssBaseline';
import {
	ThemeProvider as ThemeVarsProvider,
	type ThemeProviderProps as MuiThemeProviderProps,
} from '@mui/material/styles';
import { useSettingsContext } from 'src/components/settings';
import { useTranslate } from 'src/locales';

import { createTheme } from './create-theme';
import { Rtl } from './with-settings/right-to-left';

import type {} from './extend-theme-types';

import type { ThemeOptions } from './types';

// ----------------------------------------------------------------------

export type ThemeProviderProps = Partial<MuiThemeProviderProps> & {
	themeOverrides?: ThemeOptions;
};

export function ThemeProvider({ themeOverrides, children, ...other }: ThemeProviderProps) {
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
			<Rtl direction={settings.state.direction!}>{children}</Rtl>
		</ThemeVarsProvider>
	);
}
