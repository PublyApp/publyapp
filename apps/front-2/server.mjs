import { fileURLToPath } from 'node:url';

import { serve } from 'srvx';
import { serveStatic } from 'srvx/static';

import handler from './dist/server/server.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 3000);

const staticMiddleware = serveStatic({ dir: `${__dirname}/dist/client` });

const server = serve({
	port,
	hostname: process.env.HOST ?? '0.0.0.0',
	middleware: [staticMiddleware],
	fetch: (request) => handler.fetch(request),
});

await server.ready();

console.log(`front-2 standalone server listening on http://localhost:${port}`);
