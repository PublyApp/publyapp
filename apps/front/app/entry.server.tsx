import { PassThrough } from 'node:stream';
import { createReadableStreamFromReadable } from '@react-router/node';
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
	isPreRenderPath,
	queryParamKey,
	REMIX_CLIENT_IP_HEADER_KEY,
	STATIC_PRE_RENDER_PATHS_MAP_NONCE,
} from '@/shared/lib/constants';
import { getUnifiedCSPConfig } from '@/shared/lib/csp';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import { NonceProvider } from './hooks/use-nonce';
import { iniI18nOnServer } from './lib/i18n/init-i18n.server';
import { getDevContext } from './lib/react-router/get-dev-context.server';

export const streamTimeout = import.meta.env.DEV ? 50_000 : 5_000;

const handleRequest = async (
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	loadContext: AppLoadContext,
) => {
	const finalLoadContext = getDevContext(loadContext);

	const postHogServer = finalLoadContext.postHogServer;

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

			postHogServer.capture({
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

		// regardless of the environment, we want to set the nonce
		// to the static pre render path nonce if the path is a pre render path
		if (isPreRenderPath(new URL(request.url).pathname)) {
			finalLoadContext.___NONCE___ = STATIC_PRE_RENDER_PATHS_MAP_NONCE;
		}

		const nonce = _.toString(finalLoadContext.___NONCE___) || nanoid();

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
				nonce,
				[readyOption]: () => {
					shellRendered = true;
					const body = new PassThrough();
					const stream = createReadableStreamFromReadable(body);

					responseHeaders.set('Content-Type', 'text/html');

					// Set CSP headers
					const isDevelopment = import.meta.env.DEV;

					if (isDevelopment) {
						const cspConfig = getUnifiedCSPConfig({
							isDevelopment,
							reportOnly: false,
							nonce,
						});
						responseHeaders.set(cspConfig.headerKey, cspConfig.header);
					}

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
