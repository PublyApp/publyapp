// import path from 'path';

import { CacheProvider } from '@emotion/react';
import createEmotionServer from '@emotion/server/create-instance';
import type { EntryContext } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { createInstance } from 'i18next';
import Backend from 'i18next-fs-backend';
import * as ReactDOMServer from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

import createEmotionCache from './lib/emotion/createEmotionCache';
import i18n, { returnLanguageIfSupported } from './lib/i18n/i18n';
import i18next from './lib/i18n/i18next.server';

const handleRequest = async (
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	remixContext: EntryContext,
) => {
	const url = new URL(request.url);
	const { pathname } = url;
	const lang = pathname.split('/')[1];

	const instance = createInstance();
	const lng = returnLanguageIfSupported(lang) ?? (await i18next.getLocale(request));
	const ns = i18next.getRouteNamespaces(remixContext);

	await instance
		.use(initReactI18next) // Tell our instance to use react-i18next
		.use(Backend) // Setup our backend
		.init({
			...i18n, // spread the configuration
			lng, // The locale we detected above
			ns, // The namespaces the routes about to render wants to use
			// backend: { loadPath: path.resolve('./public/locales/{{lng}}/{{ns}}.json') }, // ! i use Ts files so I don't need this
		});

	const cache = createEmotionCache();
	const { extractCriticalToChunks } = createEmotionServer(cache);

	const MuiRemixServer = () => {
		return (
			<I18nextProvider i18n={instance}>
				<CacheProvider value={cache}>
					<ThemeProvider>
						<RemixServer context={remixContext} url={request.url} />
					</ThemeProvider>
				</CacheProvider>
			</I18nextProvider>
		);
	};

	// Render the component to a string.
	const html = ReactDOMServer.renderToString(<MuiRemixServer />);

	// Grab the CSS from emotion
	const { styles } = extractCriticalToChunks(html);

	let stylesHTML = '';

	styles.forEach(({ key, ids, css }) => {
		const emotionKey = `${key} ${ids.join(' ')}`;
		const newStyleTag = `<style data-emotion="${emotionKey}">${css}</style>`;
		stylesHTML = `${stylesHTML}${newStyleTag}`;
	});

	// Add the Emotion style tags after the insertion point meta tag
	const markup = html.replace(
		/<meta(\s)*name="emotion-insertion-point"(\s)*content="emotion-insertion-point"(\s)*\/>/,
		`<meta name="emotion-insertion-point" content="emotion-insertion-point"/>${stylesHTML}`,
	);

	responseHeaders.set('Content-Type', 'text/html');

	return new Response(`<!DOCTYPE html>${markup}`, {
		status: responseStatusCode,
		headers: responseHeaders,
	});
};

export default handleRequest;
