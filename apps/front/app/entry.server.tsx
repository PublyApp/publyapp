// import path from 'path';

import { CacheProvider } from '@emotion/react';
import createEmotionServer from '@emotion/server/create-instance';
import type { EntryContext } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import _ from 'lodash';
import ReactDOMServer from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';

import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

import type { AppLocale } from '@/shared/lib/i18n/resources';

import createEmotionCache from './lib/emotion/createEmotionCache';
import i18next from './lib/i18n/i18next.server';
import { returnLanguageIfSupported } from './lib/i18n/i18nextCommonUtils';
import { initI18nextOnServer } from './lib/i18n/initI18nextOnServer';

const handleRequest = async (
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	remixContext: EntryContext,
) => {
	const url = new URL(request.url);
	const { pathname } = url;
	const localeInUrl: string | undefined = pathname.split('/')[1];
	const locale = returnLanguageIfSupported(localeInUrl) ?? ((await i18next.getLocale(request)) as AppLocale);

	const i18nInstance = await initI18nextOnServer({ remixContext, locale });

	const cache = createEmotionCache();
	const { extractCriticalToChunks } = createEmotionServer(cache);

	const MuiRemixServer = () => {
		return (
			<I18nextProvider i18n={i18nInstance}>
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
