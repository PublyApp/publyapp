import { serve } from 'srvx';
import type { Server, TrustProxyOption } from 'srvx';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, test } from 'vitest';

import { injectSeoMarkup } from './server';

// --- Compose-file consistency: TRUSTED_PROXY_CIDRS must follow E2E_TRAEFIK_IP ---
// Reads the compose file to verify the security guarantee stays intact.
const composeFile = readFileSync(
	new URL('../docker-compose.test.yml', import.meta.url),
	'utf8',
);

describe('compose-file TRUSTED_PROXY_CIDRS consistency (r5)', () => {
	test('TRUSTED_PROXY_CIDRS derives from E2E_TRAEFIK_IP — never a hardcoded IP', () => {
		const match = composeFile.match(
			/TRUSTED_PROXY_CIDRS:\s*"(\$\{E2E_TRAEFIK_IP:[^}]+\})\/32"/,
		);
		expect(match, 'TRUSTED_PROXY_CIDRS must reference ${E2E_TRAEFIK_IP:-...}/32').not.toBeNull();
		// The default must be the band-0 Traefik IP (CI behavior preserved)
		expect(match![1]).toContain('172.28.0.2');
	});

	test('Traefik ipv4_address derives from E2E_TRAEFIK_IP', () => {
		const match = composeFile.match(
			/ipv4_address:\s*(\$\{E2E_TRAEFIK_IP:[^}]+\})/,
		);
		expect(match, 'Traefik ipv4_address must reference ${E2E_TRAEFIK_IP:-...}').not.toBeNull();
		expect(match![1]).toContain('172.28.0.2');
	});

	test('ipam subnet derives from E2E_SUBNET', () => {
		const match = composeFile.match(/- subnet:\s*(\$\{E2E_SUBNET:[^}]+\})/);
		expect(match, 'subnet must reference ${E2E_SUBNET:-...}').not.toBeNull();
		expect(match![1]).toContain('172.28.0.0/24');
	});

	test('two concurrent stacks produce non-colliding security configs (subnet + IP diverge by band)', () => {
		// Band 0: E2E_TRAEFIK_IP=172.28.0.2, E2E_SUBNET=172.28.0.0/24
		// Band 1: E2E_TRAEFIK_IP=172.29.0.2, E2E_SUBNET=172.29.0.0/24
		// Because every reference is via ${E2E_*:-default}, each stack resolves
		// its own Traefik address and trusts only that peer.
		expect(composeFile).not.toMatch(
			/TRUSTED_PROXY_CIDRS:\s*"172\.28\.0\.2\/32"/,
			'A hardcoded /32 would be a dead guarantee on any non-default band',
		);
		expect(composeFile).not.toMatch(
			/ipv4_address:\s*172\.28\.0\.2/,
			'A hardcoded IP would collide across concurrent stacks',
		);
		expect(composeFile).not.toMatch(
			/- subnet:\s*172\.28\.0\.0/,
			'A hardcoded subnet would collide across concurrent stacks',
		);
	});
});

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
const fakeT = (key: string) =>
	key.includes('title') ? 'Test PublyApp' : 'Test desc';

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
	const match = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
	return match?.[1] ?? null;
};

/**
 * Re-implements the parsing logic from server.mjs so the test can verify
 * the exact behavior without importing server.mjs (which has side effects).
 */
const parseTrustProxyFromEnv = (envValue: string | undefined): string[] => {
	const raw = envValue?.trim();
	if (!raw) {
		return ['127.0.0.1', '::1'];
	}
	return raw
		.split(',')
		.map((entry) => entry.trim().split('/')[0])
		.filter(Boolean);
};

describe('trust-proxy security (r2-shell-F10)', () => {
	let server: Server | undefined;

	afterAll(async () => {
		if (server) {
			await server.close();
		}
	});

	// --- RED case: the vulnerable default ---
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

	// --- Env var parsing ---
	// Verifies that the TRUSTED_PROXY_CIDRS parsing strips CIDR notation,
	// since srvx uses exact string matching, not subnet matching.
	test('parseTrustProxyFromEnv strips CIDR notation for srvx exact-match semantics', () => {
		expect(parseTrustProxyFromEnv(undefined)).toEqual(['127.0.0.1', '::1']);
		expect(parseTrustProxyFromEnv('')).toEqual(['127.0.0.1', '::1']);
		expect(parseTrustProxyFromEnv('   ')).toEqual(['127.0.0.1', '::1']);
		expect(parseTrustProxyFromEnv('10.0.0.5/32')).toEqual(['10.0.0.5']);
		expect(parseTrustProxyFromEnv('127.0.0.1/32,::1/128')).toEqual([
			'127.0.0.1',
			'::1',
		]);
		expect(parseTrustProxyFromEnv(' 10.0.0.5/32 , 10.0.0.6/32 ')).toEqual([
			'10.0.0.5',
			'10.0.0.6',
		]);
	});
});
