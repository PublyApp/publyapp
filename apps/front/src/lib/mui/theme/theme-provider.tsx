import CssBaseline from '@mui/material/CssBaseline';
import {
	type ThemeProviderProps as MuiThemeProviderProps,
	ThemeProvider as ThemeVarsProvider,
} from '@mui/material/styles';

import { useSettingsContext } from '#app/hooks/use-settings-context.ts';

import { useTranslate } from '../../../hooks/use-translate';
import { createTheme } from './create-theme';
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
			{children}
		</ThemeVarsProvider>
	);
};
