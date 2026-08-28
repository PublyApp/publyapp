import { serve } from 'srvx';
import type { Server, TrustProxyOption } from 'srvx';
import { afterAll, describe, expect, test } from 'vitest';

import { injectSeoMarkup } from './server';

/**
 * Security test for r2-shell-F10: proves that bounded trust proxy causes
 * srvx to ignore forged `x-forwarded-*` headers from untrusted peers, so
 * `injectSeoMarkup` never emits a canonical/og:url pointing at an
 * attacker-controlled domain.
 *
 * The existing e2e SEO test passes through Traefik (which sets these headers
 * legitimately) and can only ever exercise the happy path. This test sends a
 * forged `x-forwarded-host` directly to the server, bypassing any proxy, and
 * asserts the origin falls back to the real socket origin.
 */

const HOST = '127.0.0.1';
const FORGED_HOST = 'evil-attacker.com';
const FORGED_PROTO = 'https';
const REAL_PATH = '/';

const htmlWithHead =
	'<html><head><title>Test</title></head><body></body></html>';

/** Minimal translator that returns a fixed title. */
const fakeT = (key: string) => (key.includes('title') ? 'Test PublyApp' : 'Test desc');

/**
 * Starts a srvx server whose fetch handler mirrors the real front handler's
 * SEO injection: it reads `request.url` (which srvx may have rewritten from
 * forwarded headers) and injects canonical/og:url from it.
 */
const startServer = async (
	trustProxy: TrustProxyOption,
): Promise<{ server: Server; origin: string }> => {
	const server = serve({
		port: 0,
		hostname: HOST,
		trustProxy,
		fetch: async (request: Request) => {
			const updatedHtml = injectSeoMarkup(
				htmlWithHead,
				request,
				'en',
				true,
				fakeT,
			);
			return new Response(updatedHtml, {
				status: 200,
				headers: { 'content-type': 'text/html; charset=utf-8' },
			});
		},
	});

	await server.ready();

	const address = server.node?.server?.address();
	if (!address || typeof address === 'string') {
		throw new Error('server did not bind to a port');
	}

	const origin = `http://${HOST}:${address.port}`;
	return { server, origin };
};

const extractCanonical = (html: string): string | null => {
	const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
	return match?.[1] ?? null;
};

const extractOgUrl = (html: string): string | null => {
	const match = html.match(
		/<meta\s+property="og:url"\s+content="([^"]+)"/i,
	);
	return match?.[1] ?? null;
};

describe('trust-proxy security (r2-shell-F10)', () => {
	let server: Server | undefined;

	afterAll(async () => {
		if (server) {
			await server.close();
		}
	});

	// --- RED case: the vulnerable default ---
	// `trustProxy: true` accepts forwarded headers from ANY peer, including a
	// direct request that never passed through Traefik. The canonical then
	// points at the attacker's domain.
	test('trustProxy: true accepts forged x-forwarded-host from a direct peer (RED — vulnerability present)', async () => {
		const { server: s, origin } = await startServer(true);
		server = s;

		const response = await fetch(`${origin}${REAL_PATH}`, {
			headers: {
				'x-forwarded-host': FORGED_HOST,
				'x-forwarded-proto': FORGED_PROTO,
			},
		});
		const html = await response.text();

		// The vulnerability: forged host is accepted as the origin.
		expect(extractCanonical(html)).toContain(FORGED_HOST);
		expect(extractOgUrl(html)).toContain(FORGED_HOST);
	});

	// --- GREEN case: bounded trust proxy ---
	// A request from 127.0.0.1 to a server that trusts a DIFFERENT address has
	// its forwarded headers dropped, so canonical falls back to the real socket
	// origin. This mirrors production: `TRUSTED_PROXY_CIDRS` set to Traefik's
	// exact address means peer containers on `dokploy-network` cannot forge XFF.
	test('bounded trust proxy ignores forged x-forwarded-host from an untrusted peer (GREEN — fix applied)', async () => {
		// Trust an address that is NOT 127.0.0.1, so this test's peer
		// (127.0.0.1) is untrusted and forwarded headers are ignored.
		const { server: s, origin } = await startServer(['10.255.255.1']);
		server = s;

		const response = await fetch(`${origin}${REAL_PATH}`, {
			headers: {
				'x-forwarded-host': FORGED_HOST,
				'x-forwarded-proto': FORGED_PROTO,
			},
		});
		const html = await response.text();

		// The fix: forged host is NOT accepted; origin falls back to socket.
		expect(extractCanonical(html)).not.toContain(FORGED_HOST);
		expect(extractOgUrl(html)).not.toContain(FORGED_HOST);
		expect(extractCanonical(html)).toContain(HOST);
		expect(extractOgUrl(html)).toContain(HOST);
	});

	// --- Legitimate proxy path still works ---
	// When the request comes from a trusted peer, forwarded headers ARE
	// accepted. This proves the fix does not break the Traefik path.
	test('trusted peer: forwarded headers accepted from loopback when loopback is trusted', async () => {
		// Trust loopback (the test's own peer), so forwarded headers apply.
		// In production the trusted peer is Traefik, not loopback; this test
		// asserts the positive direction of the trust gate: trusted peer →
		// headers honored.
		const { server: s, origin } = await startServer(['127.0.0.1', '::1']);
		server = s;

		const response = await fetch(`${origin}${REAL_PATH}`, {
			headers: {
				'x-forwarded-host': 'legitimate-proxy.test',
				'x-forwarded-proto': 'https',
			},
		});
		const html = await response.text();

		// Trusted peer's forwarded headers are applied.
		expect(extractCanonical(html)).toContain('legitimate-proxy.test');
		expect(extractOgUrl(html)).toContain('legitimate-proxy.test');
	});
});
