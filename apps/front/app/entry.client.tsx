import * as React from 'react';

import { CacheProvider } from '@emotion/react';
import { RemixBrowser } from '@remix-run/react';
import i18next from 'i18next';
import * as ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

import ThemeProvider from '@/ui-react/providers/ThemeProvider';

import ClientStyleContext from './contexts/ClientStyleContext';
import createEmotionCache from './lib/emotion/createEmotionCache';
import { initI18nextOnClient } from './lib/i18n/initI18nextOnClient';
import { initParseOnClient } from './lib/parse/initParseOnClient';

interface ClientCacheProviderProps {
	children: React.ReactNode;
}

// prefetch images
// window.image404 = new Image();
// window.image404.src = `${window.location.origin}/assets/illustrations/illustration_404.svg`;

// window.image500 = new Image();
// window.image500.src = `${window.location.origin}/assets/illustrations/illustration_500.svg`;

const ClientCacheProvider = ({ children }: ClientCacheProviderProps) => {
	const [cache, setCache] = React.useState(createEmotionCache());

	const clientStyleContextValue = React.useMemo(() => {
		return {
			reset: () => {
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

const hydrate = async () => {
	initI18nextOnClient();
	initParseOnClient();
	// TODO: init the libs below
	// initNumeral();
	// initZod();

	React.startTransition(() => {
		ReactDOM.hydrateRoot(
			document,
			<I18nextProvider i18n={i18next}>
				<ClientCacheProvider>
					<ThemeProvider>
						<RemixBrowser />
					</ThemeProvider>
				</ClientCacheProvider>
			</I18nextProvider>,
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
