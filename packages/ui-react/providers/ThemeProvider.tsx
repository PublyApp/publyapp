import { type ReactNode } from 'react';

import { ThemeProvider as EmotionProvider } from '@emotion/react';
import { createTheme, CssBaseline } from '@mui/material';

import { getComponentOverrides } from '@ui-react/lib/mui/overrides/_index';
import { themeOptions } from '@ui-react/lib/mui/theme';

type Props = {
	children: ReactNode;
};

const ThemeProvider = ({ children }: Props) => {
	const theme = createTheme(themeOptions);
	theme.components = getComponentOverrides(theme);

	return (
		<EmotionProvider theme={theme}>
			<CssBaseline />
			{children}
		</EmotionProvider>
	);
};

export default ThemeProvider;
