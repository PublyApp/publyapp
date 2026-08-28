import { lookup } from 'node:dns/promises';
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
 * Resolves the trusted proxy list for srvx. Two modes:
 *
 * 1. Explicit TRUSTED_PROXY_CIDRS (production, local smoke): parse the CSV,
 *    strip CIDR suffixes (srvx uses exact string matching, not subnet
 *    matching), and trust only those peers.
 *
 * 2. E2E_DISCOVER_TRUSTED_PROXY (e2e compose stack): Docker allocates a free
 *    subnet for the stack's network, so the subnet cannot be known ahead of
 *    time. Resolve Traefik's IP at startup via Docker's embedded DNS
 *    (`traefik` hostname → container IP on the shared network) and trust
 *    only that peer. This preserves the exact security property — only
 *    Traefik's x-forwarded-* headers are honored — without depending on a
 *    frozen subnet that may collide with an existing network on the host.
 *
 * In both cases, a direct request from any other IP falls back to the real
 * socket origin.
 */
const resolveTrustProxyFromEnv = async () => {
	const raw = process.env.TRUSTED_PROXY_CIDRS?.trim();
	if (raw) {
		return raw
			.split(',')
			.map((entry) => entry.trim().split('/')[0])
			.filter((entry) => entry.length > 0);
	}

	if (process.env.E2E_DISCOVER_TRUSTED_PROXY === 'true') {
		try {
			const address = await lookup('traefik', { family: 4 });
			console.log(
				`[trust-proxy] discovered Traefik at ${address.address} via Docker DNS — trusting only this peer for x-forwarded-* headers.`,
			);
			return [address.address];
		} catch (error) {
			console.error(
				`[trust-proxy] E2E_DISCOVER_TRUSTED_PROXY is set but failed to resolve Traefik's IP (${String(error)}). ` +
					'Falling back to loopback-only trust — the e2e stack will not function correctly.',
			);
			return ['127.0.0.1', '::1'];
		}
	}

	console.warn(
		'[trust-proxy] TRUSTED_PROXY_CIDRS is unset or empty — falling back to loopback-only trust (127.0.0.1, ::1). ' +
			'In production with a reverse proxy (Traefik), set TRUSTED_PROXY_CIDRS to the proxy peer address as /32.',
	);
	return ['127.0.0.1', '::1'];
};

const trustProxy = await resolveTrustProxyFromEnv();

const server = serve({
	port,
	hostname: process.env.HOST ?? '0.0.0.0',
	trustProxy,
	middleware: [staticFileHandler],
	fetch: (request) => handler.fetch(request),
});

await server.ready();

console.log(`front standalone server listening on http://localhost:${port}`);
