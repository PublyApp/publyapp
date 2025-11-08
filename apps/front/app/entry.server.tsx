import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
import * as cookie from 'cookie';
import { isbot } from 'isbot';
import _ from 'lodash';
import { nanoid } from 'nanoid';
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
import {
	CLOUDFLARE_CONNECTING_IP_HEADER_KEY,
	LANGUAGE_DETECTION_METHOD,
	LANGUAGE_DETECTION_METHOD_ENUM,
	LOCALE_COOKIE_KEY,
	queryParamKey,
	REMIX_CLIENT_IP_HEADER_KEY,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import { NonceProvider } from './hooks/use-nonce';
import { iniI18nOnServer } from './lib/i18n/init-i18n.server';

export const streamTimeout = import.meta.env.DEV ? 50_000 : 5_000;

const handleRequest = async (
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	loadContext: AppLoadContext,
) => {
	const finalLoadContext = loadContext;

	const analytics = finalLoadContext.analytics;

	if (import.meta.env.PROD) {
		if (!_.toString(responseStatusCode).startsWith('2')) {
			const ipAddresses = {};
			_.forEach(
				[
					_.toLower(CLOUDFLARE_CONNECTING_IP_HEADER_KEY),
					_.toLower(REMIX_CLIENT_IP_HEADER_KEY),
					// 'x-forwarded-for',
					// 'x-real-ip',
					// 'x-client-ip',
					// 'x-forwarded',
					// 'forwarded-for',
					// 'forwarded',
				],
				(headerKey) => {
					const lowerKey = _.toLower(headerKey);
					_.set(ipAddresses, lowerKey, request.headers.get(lowerKey));
				},
			);

			analytics.capture({
				distinctId:
					_.get(ipAddresses, _.toLower(REMIX_CLIENT_IP_HEADER_KEY)) ||
					_.get(ipAddresses, _.toLower(CLOUDFLARE_CONNECTING_IP_HEADER_KEY)) ||
					nanoid(),
				event: 'bad_request',
				properties: {
					path: request.url,
					method: request.method,
					// host: request.headers.get('host'),
					userAgent: request.headers.get('user-agent'),
					...ipAddresses,
				},
			});
		}
	}

	let locale: AppLocale;

	if (
		LANGUAGE_DETECTION_METHOD === LANGUAGE_DETECTION_METHOD_ENUM.QUERY_PARAM
	) {
		const url = new URL(request.url);
		const language = url.searchParams.get(queryParamKey.language);
		locale = getCorrectLocale(language);
	} else {
		const reqCookies = cookie.parse(request.headers.get('cookie') || '');
		const localeCookie = _.get(reqCookies, LOCALE_COOKIE_KEY);
		locale = getCorrectLocale(localeCookie);
	}

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

		// regardless of the environment, we want to set the nonce
		// to the static pre render path nonce if the path is a pre render path
		// if (isPreRenderPath(new URL(request.url).pathname)) {
		// 	finalLoadContext.nonce = STATIC_PRE_RENDER_PATHS_MAP_NONCE;
		// }

		const nonce = finalLoadContext.nonce;

		const { pipe, abort } = renderToPipeableStream(
			<I18nextProvider i18n={i18nInstance}>
				<NonceProvider value={nonce}>
					<ServerRouter
						context={routerContext}
						url={request.url}
						nonce={nonce}
					/>
				</NonceProvider>
			</I18nextProvider>,
			{
				nonce: nonce,
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
