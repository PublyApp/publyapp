// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';

import type { AppProps } from 'next/app';

import QueryProvider from '@devist/ui-react/providers/QueryProvider';
import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

const App = ({ Component, pageProps }: AppProps) => {
	return (
		<QueryProvider>
			<ThemeProvider>
				<Component {...pageProps} />
			</ThemeProvider>
		</QueryProvider>
	);
};

export default App;
