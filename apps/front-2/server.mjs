import { fileURLToPath } from 'node:url';

import { serve } from 'srvx';
import { serveStatic } from 'srvx/static';

import handler from './dist/server/server.js';

// `~/lib/env.ts`'s getPublicApiBaseUrl()/getServerApiBaseUrl() only throw
// lazily, the first time a request actually needs the API base URL — a
// misconfigured deployment would otherwise boot "successfully" and only
// fail on the first request that hits them (review-r3-shell.md F12).
// Fail fast here instead, before accepting any traffic. Deliberately
// checked with plain `process.env` (not the isomorphic `@org/shared-ts`
// logger or the `~/lib/env.ts` zod schemas): this file is a raw,
// unbundled Node entrypoint with no bundler to resolve shared-ts's
// extensionless relative imports, and no request context yet to route
// through the app's own env module.
for (const requiredVar of ['PUBLIC_API_BASE_URL', 'SERVER_API_BASE_URL']) {
	if (!process.env[requiredVar]?.trim()) {
		console.error(
			`front-2 standalone server: missing required env var ${requiredVar} — refusing to start.`,
		);
		process.exit(1);
	}
}

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
