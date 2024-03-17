// import { PassThrough, Transform } from 'stream';

// import { CacheProvider } from '@emotion/react';
// import createEmotionServer from '@emotion/server/create-instance';
// import { type EntryContext } from '@remix-run/node';
// import { RemixServer } from '@remix-run/react';
// // import { Response } from 'node-fetch';
// import * as ReactDOMServer from 'react-dom/server';

// import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

// import createEmotionCache from './lib/emotion/createEmotionCache';

// const handleRequest = (
// 	request: Request,
// 	responseStatusCode: number,
// 	responseHeaders: Headers,
// 	remixContext: EntryContext,
// ) => {
// 	return new Promise((resolve, reject) => {
// 		let didError = false;
// 		const cache = createEmotionCache();

// 		const MuiRemixServer = () => {
// 			return (
// 				<CacheProvider value={cache}>
// 					<ThemeProvider>
// 						<RemixServer context={remixContext} url={request.url} />
// 					</ThemeProvider>
// 				</CacheProvider>
// 			);
// 		};

// 		const { pipe } = ReactDOMServer.renderToPipeableStream(<MuiRemixServer />, {
// 			onShellReady: () => {
// 				const body = new PassThrough({
// 					transform: (chunk, encoding, callback) => {
// 						console.log('😡😡😡😡', chunk.toString());

// 						callback(null, chunk);
// 					},
// 				});
// 				const { renderStylesToNodeStream } = createEmotionServer(cache);

// 				const bodyWithStyles = renderStylesToNodeStream();
// 				body.pipe(bodyWithStyles);

// 				responseHeaders.set('Content-Type', 'text/html');

// 				resolve(
// 					new Response(bodyWithStyles as never, {
// 						// status: responseStatusCode,
// 						status: didError ? 500 : responseStatusCode,
// 						headers: responseHeaders,
// 					}),
// 				);

// 				pipe(body);
// 			},
// 			onShellError: (error: unknown) => {
// 				reject(error);
// 			},
// 			onError: (error: unknown) => {
// 				didError = true;

// 				console.error(error);
// 			},
// 		});
// 	});
// };

// export default handleRequest;
