import { PassThrough } from 'node:stream';

import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import { renderToPipeableStream, type RenderToPipeableStreamOptions } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { ServerRouter, type AppLoadContext, type EntryContext } from 'react-router';

import { queryParamKey } from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';

import { iniI18nOnServer } from './lib/i18n/init.server';

const ABORT_DELAY = 50_000;

const handleRequest = async (
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	_loadContext: AppLoadContext,
) => {
	const url = new URL(request.url);
	const language = url.searchParams.get(queryParamKey.language);
	const locale = getCorrectLocale(language);
	const i18nInstance = await iniI18nOnServer({ routerContext, locale });

	return new Promise((resolve, reject) => {
		let shellRendered = false;
		const userAgent = request.headers.get('user-agent');

		// Ensure requests from bots and SPA Mode renders wait for all content to load before responding
		// https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
		const readyOption: keyof RenderToPipeableStreamOptions =
			(userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

		const { pipe, abort } = renderToPipeableStream(
			<I18nextProvider i18n={i18nInstance}>
				<ServerRouter context={routerContext} url={request.url} abortDelay={ABORT_DELAY} />
			</I18nextProvider>,
			{
				[readyOption]: () => {
					shellRendered = true;
					const body = new PassThrough();
					const stream = createReadableStreamFromReadable(body);

					responseHeaders.set('Content-Type', 'text/html');

					resolve(
						new Response(stream, {
							headers: responseHeaders,
							status: responseStatusCode,
						}),
					);

					pipe(body);
				},
				onShellError: (error: unknown) => {
					reject(error);
				},
				onError: (error: unknown) => {
					// eslint-disable-next-line no-param-reassign
					responseStatusCode = 500;

					// Log streaming rendering errors from inside the shell.  Don't log
					// errors encountered during initial shell rendering since they'll
					// reject and get logged in handleDocumentRequest.
					if (shellRendered) {
						console.error(error);
					}
				},
			},
		);

		setTimeout(abort, ABORT_DELAY);
	});
};

export default handleRequest;
