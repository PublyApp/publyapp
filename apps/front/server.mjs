import { fileURLToPath } from 'node:url';

import { serve } from 'srvx';
import { staticMiddleware } from 'srvx/static';

import handler, { validateRuntimeEnv } from './dist/server/server.js';

validateRuntimeEnv();

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 3000);

const staticHandler = staticMiddleware({ dir: `${__dirname}/dist/client` });

const server = serve({
	port,
	hostname: process.env.HOST ?? '0.0.0.0',
	// The front container is ONLY ever reached through the trusted reverse
	// proxy (Traefik terminates TLS; see docker-compose.test.yml +
	// production-deployment-design.md). srvx 0.12 gates all x-forwarded-*
	// handling behind `trustProxy` (#223): without it, request.url keeps the
	// internal http://front:3000 origin, and the SEO handler's canonical/
	// og:url tags built from request.url advertised http:// to crawlers
	// (caught by e2e seo.spec.ts after the 0.11.16→0.12.5 bump in the
	// #1236 supersede commit). `true` is safe here: there is no direct
	// client access to the front port, so every hop IS the trusted proxy.
	trustProxy: true,
	middleware: [staticHandler],
	fetch: (request) => handler.fetch(request),
});

await server.ready();

console.log(`front standalone server listening on http://localhost:${port}`);
