import { PassThrough } from 'node:stream';

import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import {
	type RenderToPipeableStreamOptions,
	renderToPipeableStream,
} from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import {
	type AppLoadContext,
	type EntryContext,
	ServerRouter,
} from 'react-router';

import { queryParamKey } from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';

import { iniI18nOnServer } from './lib/i18n/init-i18n.server';
import _ from 'lodash';

export const streamTimeout = 5_000;

const handleRequest = async (
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	loadContext: AppLoadContext,
) => {
	if (loadContext.postHogServer) {
		if (!_.toString(responseStatusCode).startsWith('2')) {
			loadContext.postHogServer.capture({
				event: 'bad_request',
				properties: {
					path: request.url,
					method: request.method,
					host: request.headers.get('host'),
					ipAddress: request.headers.get('x-forwarded-for'),
					userAgent: request.headers.get('user-agent'),
				},
			});
		}
	}

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
			(userAgent && isbot(userAgent)) || routerContext.isSpaMode
				? 'onAllReady'
				: 'onShellReady';

		const { pipe, abort } = renderToPipeableStream(
			<I18nextProvider i18n={i18nInstance}>
				<ServerRouter context={routerContext} url={request.url} />
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
					// biome-ignore lint/style/noParameterAssign: boilerplate from react-router framework scaffolding, just left as is
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

		// Abort the streaming render pass after 11 seconds to allow the rejected
		// boundaries to be flushed
		setTimeout(abort, streamTimeout + 1000);
	});
};

export default handleRequest;
