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
 * Bounded trust proxy (r2-shell-F10): srvx accepts an array of IPs for
 * `trustProxy`. Only peers in that list have their `x-forwarded-*` headers
 * applied; everyone else falls back to the real socket origin.
 *
 * Note: srvx's `isTrustedProxy` uses exact string matching
 * (`Array.includes()`), NOT CIDR subnet matching. So we strip any `/32` or
 * `/128` suffix from `TRUSTED_PROXY_CIDRS` before passing to srvx.
 * Defaults to loopback-only; production sets `TRUSTED_PROXY_CIDRS` to
 * Traefik's exact address(es).
 */
const resolveTrustProxyFromEnv = () => {
	const raw = process.env.TRUSTED_PROXY_CIDRS?.trim();
	if (!raw) {
		console.warn(
			'[trust-proxy] TRUSTED_PROXY_CIDRS is unset or empty — falling back to loopback-only trust (127.0.0.1, ::1). ' +
				'In production with a reverse proxy (Traefik), set TRUSTED_PROXY_CIDRS to the proxy peer address as /32.',
		);
		return ['127.0.0.1', '::1'];
	}
	return raw
		.split(',')
		.map((entry) => entry.trim().split('/')[0])
		.filter((entry) => entry.length > 0);
};

const server = serve({
	port,
	hostname: process.env.HOST ?? '0.0.0.0',
	trustProxy: resolveTrustProxyFromEnv(),
	middleware: [staticFileHandler],
	fetch: (request) => handler.fetch(request),
});

await server.ready();

console.log(`front standalone server listening on http://localhost:${port}`);
