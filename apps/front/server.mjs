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

/**
 * Bounded trust proxy (r2-shell-F10): srvx accepts an array of IPs/CIDRs for
 * `trustProxy`. Only peers in that list have their `x-forwarded-*` headers
 * applied; everyone else falls back to the real socket origin. Defaults to
 * loopback-only; production sets `TRUSTED_PROXY_CIDRS` to Traefik's exact
 * /32 (or /128) address(es).
 */
const trustProxy = (() => {
	const cidrs = process.env.TRUSTED_PROXY_CIDRS?.trim();
	if (!cidrs) {
		return ['127.0.0.1/32', '::1/128'];
	}
	return cidrs.split(',').map((c) => c.trim()).filter(Boolean);
})();

const server = serve({
	port,
	hostname: process.env.HOST ?? '0.0.0.0',
	trustProxy,
	middleware: [staticFileHandler],
	fetch: (request) => handler.fetch(request),
});

await server.ready();

console.log(`front standalone server listening on http://localhost:${port}`);
