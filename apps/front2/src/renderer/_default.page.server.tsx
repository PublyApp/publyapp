import ReactDOMServer from 'react-dom/server';
import { dangerouslySkipEscape, escapeInject } from 'vite-plugin-ssr/server';

import { PageShell } from './PageShell';
import type { PageContextServer } from './types';

// See https://vite-plugin-ssr.com/data-fetching
export const passToClient = ['pageProps', 'urlPathname'];

async function render(pageContext: PageContextServer) {
	const { Page, pageProps } = pageContext;
	// This render() hook only supports SSR, see https://vite-plugin-ssr.com/render-modes for how to modify render() to support SPA
	if (!Page) throw new Error('My render() hook expects pageContext.Page to be defined');
	const pageHtml = ReactDOMServer.renderToString(
		<PageShell pageContext={pageContext}>
			<Page {...pageProps} />
		</PageShell>,
	);

	// See https://vite-plugin-ssr.com/head
	const { documentProps } = pageContext.exports;
	const title = (documentProps && documentProps.title) || 'Vite SSR app';
	const desc = (documentProps && documentProps.description) || 'App using Vite + vite-plugin-ssr';

	const documentHtml = escapeInject`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <link rel="icon" href="${/* TODO: */ '/idk.png'}" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="${desc}" />
        <title>${title}</title>
      </head>
      <body>
        <div id="react-root">${dangerouslySkipEscape(pageHtml)}</div>
				<script
					src="https://cdnjs.cloudflare.com/ajax/libs/parse/4.1.0/parse.min.js"
					integrity="sha512-2/9fubrdhOAa2Cvi5O+knV3Wn6OQolBy2gehNiLTfDSV0dffegVlQEfEK9kIGdNmJimGuNS0g/3+kyxIKlTy1w=="
					crossorigin="anonymous"
					referrerpolicy="no-referrer"
				></script>
      </body>
    </html>`;

	return {
		documentHtml,
		pageContext: {
			// We can add some `pageContext` here, which is useful if we want to do page redirection https://vite-plugin-ssr.com/page-redirection
		},
	};
}

export { render };
