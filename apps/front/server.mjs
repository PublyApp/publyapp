import { fileURLToPath } from 'node:url';

import { serve } from 'srvx';
import { staticMiddleware as createStaticMiddleware } from 'srvx/static';

import handler, { validateRuntimeEnv } from './dist/server/server.js';

validateRuntimeEnv();

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 3000);

const staticFileHandler = createStaticMiddleware({
	dir: `${__dirname}/dist/client`,
});

const server = serve({
	port,
	hostname: process.env.HOST ?? '0.0.0.0',
	trustProxy: true,
	middleware: [staticFileHandler],
	fetch: (request) => handler.fetch(request),
});

await server.ready();

console.log(`front standalone server listening on http://localhost:${port}`);
