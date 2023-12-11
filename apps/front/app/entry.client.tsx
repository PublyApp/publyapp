/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */
import * as React from 'react';

import { CacheProvider } from '@emotion/react';
// import CssBaseline from '@mui/material/CssBaseline';
// import { ThemeProvider } from '@mui/material/styles';
import { RemixBrowser } from '@remix-run/react';
import * as ReactDOM from 'react-dom/client';

import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

import ClientStyleContext from './contexts/ClientStyleContext';
import createEmotionCache from './lib/emotion/createEmotionCache';

// import theme from './src/theme';

interface ClientCacheProviderProps {
	children: React.ReactNode;
}

const ClientCacheProvider = ({ children }: ClientCacheProviderProps) => {
	const [cache, setCache] = React.useState(createEmotionCache());

	const clientStyleContextValue = React.useMemo(() => {
		return {
			reset() {
				setCache(createEmotionCache());
			},
		};
	}, []);

	return (
		<ClientStyleContext.Provider value={clientStyleContextValue}>
			<CacheProvider value={cache}>{children}</CacheProvider>
		</ClientStyleContext.Provider>
	);
};

const hydrate = () => {
	React.startTransition(() => {
		ReactDOM.hydrateRoot(
			document,
			<ClientCacheProvider>
				<ThemeProvider>
					{/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
					{/* <CssBaseline /> */}
					<RemixBrowser />
				</ThemeProvider>
			</ClientCacheProvider>,
		);
	});
};

if (window.requestIdleCallback) {
	window.requestIdleCallback(hydrate);
} else {
	// Safari doesn't support requestIdleCallback
	// https://caniuse.com/requestidlecallback
	window.setTimeout(hydrate, 1);
}
