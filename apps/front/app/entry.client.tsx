import * as React from 'react';

import { CacheProvider } from '@emotion/react';
import { RemixBrowser } from '@remix-run/react';
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import * as ReactDOM from 'react-dom/client';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { getInitialNamespaces } from 'remix-i18next/client';

import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

import ClientStyleContext from './contexts/ClientStyleContext';
import createEmotionCache from './lib/emotion/createEmotionCache';
import i18n from './lib/i18n/i18n';

// import theme from './src/theme';

interface ClientCacheProviderProps {
	children: React.ReactNode;
}

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
	await i18next
		.use(LanguageDetector) // Setup a client-side language detector
		.use(initReactI18next) // Tell i18next to use the react-i18next plugin
		// .use(Backend) // Setup your backend
		.init({
			...i18n, // spread the configuration
			// This function detects the namespaces your routes rendered while SSR use
			ns: getInitialNamespaces(),
			// backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' }, // ! I don't need http-backend for now
			detection: {
				// Here only enable htmlTag detection, we'll detect the language only
				// server-side with remix-i18next, by using the `<html lang>` attribute
				// we can communicate to the client the language detected server-side
				order: ['htmlTag'],
				// Because we only use htmlTag, there's no reason to cache the language
				// on the browser, so we disable it
				caches: [],
			},
		});

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
