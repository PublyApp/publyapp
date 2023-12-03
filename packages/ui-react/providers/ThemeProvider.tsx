'use client';

import { useMemo, type ReactNode } from 'react';

import { ThemeProvider as EmotionProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, type ThemeOptions } from '@mui/material/styles';
import _ from 'lodash';

import { darkMode } from '@ui-react/lib/mui/options/darkMode';
import { presets } from '@ui-react/lib/mui/options/presets';
import { getComponentOverrides } from '@ui-react/lib/mui/overrides/_index';
import { customShadows } from '@ui-react/lib/mui/theme/custom-shadows';
import { createPalette } from '@ui-react/lib/mui/theme/palette';
import { createShadows } from '@ui-react/lib/mui/theme/shadows';
import { typography } from '@ui-react/lib/mui/theme/typography';

type Props = {
	children: ReactNode;
};

const ThemeProvider = ({ children }: Props) => {
	// const settings = useSettingsContext();
	const settings = {
		themeMode: 'light',
		themeColorPresets: 'purple',
	} as const;

	const darkModeOption = darkMode(settings.themeMode);
	const presetsOption = presets(settings.themeColorPresets);

	const baseOption = useMemo(() => {
		return {
			palette: createPalette(settings.themeMode),
			shadows: createShadows(settings.themeMode),
			customShadows: customShadows(settings.themeMode),
			typography,
			shape: { borderRadius: 8 },
		};
	}, []);

	const memoizedThemeOptions = useMemo(() => {
		return _.merge(baseOption, darkModeOption, presetsOption) as ThemeOptions;
	}, [baseOption, presetsOption]);

	const theme = createTheme(memoizedThemeOptions);
	theme.components = getComponentOverrides(theme);

	return (
		<EmotionProvider theme={theme}>
			<CssBaseline />
			{children}
		</EmotionProvider>
	);
};

export default ThemeProvider;
