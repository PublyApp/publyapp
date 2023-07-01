import { ReactNode } from 'react';

import { ThemeProvider as EmotionProvider } from '@emotion/react';
import { CssBaseline, createTheme } from '@mui/material';

import { themeOptions } from '../utils/theme';

type Props = {
	children: ReactNode;
};

const ThemeProvider = ({ children }: Props) => {
	const theme = createTheme(themeOptions);

	return (
		<EmotionProvider theme={theme}>
			<CssBaseline />
			{children}
		</EmotionProvider>
	);
};

export default ThemeProvider;
