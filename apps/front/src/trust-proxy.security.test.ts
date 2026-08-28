import { readFileSync } from 'node:fs';

import { serve } from 'srvx';
import type { Server, TrustProxyOption } from 'srvx';
import { afterAll, describe, expect, test } from 'vitest';

import { injectSeoMarkup } from './server';

// --- Compose-file consistency: security property preserved without a frozen subnet ---
// Reads the compose file to verify the security guarantee stays intact.
// The e2e stack no longer pins a subnet or Traefik IP — Docker allocates a
// free range at runtime. The front container discovers Traefik's IP via
// Docker's embedded DNS (`traefik` hostname) and trusts only that peer.
const composeFile = readFileSync(
	new URL('../docker-compose.test.yml', import.meta.url),
	'utf8',
);

describe('compose-file trust-proxy security (r5)', () => {
	test('front service sets E2E_DISCOVER_TRUSTED_PROXY — no hardcoded trust value', () => {
		expect(composeFile).toMatch(/E2E_DISCOVER_TRUSTED_PROXY:\s*['"]true['"]/);
	});

	test('no frozen subnet — Docker allocates a free range, removing the lottery', () => {
		expect(composeFile).not.toMatch(/subnet:\s*172\./);
		expect(composeFile).not.toMatch(/\{\$E2E_SUBNET:/);
	});

	test('no pinned Traefik IP — discovered at runtime', () => {
		expect(composeFile).not.toMatch(/ipv4_address:/);
		expect(composeFile).not.toMatch(/\{\$E2E_TRAEFIK_IP:/);
	});

	test('ipam block is absent — network is created without explicit subnet config', () => {
		// The network section should be bare: driver + external only, no ipam.
		const networkSection = composeFile.match(
			/networks:[\s\S]*?publyapp-network:[\s\S]*?(?=\n\n|\ntest:|\n\n\n|$)/,
		);
		expect(networkSection, 'network section should exist').not.toBeNull();
		expect(networkSection![0]).not.toMatch(/ipam/);
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
 * forged `x-forwarded-host` directly to a srvx server instance, bypassing any
 * proxy, and asserts the origin falls back to the real socket origin.
 *
 * It exercises the full HTTP path: real `serve()` → forged `x-forwarded-*`
 * headers over a localhost fetch → srvx's `isTrustedProxy`/`applyTrustedProxy`
 * → `injectSeoMarkup` → rendered `<link rel="canonical">`/`<meta og:url>`.
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
 * Mirrors `resolveTrustProxyFromEnv` from server.mjs so the test can verify
 * the env-parsing behavior in isolation without importing server.mjs (which
 * has side effects at module-load time). The primary behavioral coverage is
 * the RED/GREEN HTTP cases above; this unit-level check pins the CIDR-stripping
 * contract.
 */
const resolveTrustProxyFromEnv = (envValue: string | undefined): string[] => {
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

	// --- Env var parsing (unit-level pinning of the CIDR-stripping contract) ---
	// Verifies that `resolveTrustProxyFromEnv` strips CIDR notation,
	// since srvx uses exact string matching, not subnet matching.
	test('resolveTrustProxyFromEnv strips CIDR notation for srvx exact-match semantics', () => {
		expect(resolveTrustProxyFromEnv(undefined)).toEqual(['127.0.0.1', '::1']);
		expect(resolveTrustProxyFromEnv('')).toEqual(['127.0.0.1', '::1']);
		expect(resolveTrustProxyFromEnv('   ')).toEqual(['127.0.0.1', '::1']);
		expect(resolveTrustProxyFromEnv('10.0.0.5/32')).toEqual(['10.0.0.5']);
		expect(resolveTrustProxyFromEnv('127.0.0.1/32,::1/128')).toEqual([
			'127.0.0.1',
			'::1',
		]);
		expect(resolveTrustProxyFromEnv(' 10.0.0.5/32 , 10.0.0.6/32 ')).toEqual([
			'10.0.0.5',
			'10.0.0.6',
		]);
	});

	// --- Mutation test: forged x-forwarded-* from an untrusted peer is rejected ---
	// This is the core security property the PR exists to guarantee: even when
	// the trusted peer is a discovered Traefik IP (not a hardcoded value), a
	// forged x-forwarded-* header from any other IP is ignored.
	test('mutation: forged x-forwarded-host from a non-Tr peer is rejected when trust is bounded to a discovered IP', async () => {
		// Simulate the discovered Traefik IP as a non-loopback address.
		// The test's own peer is 127.0.0.1, which is NOT the trusted IP — so
		// forwarded headers from this peer must be ignored.
		const discoveredTraefikIp = '172.20.0.5';
		const { server: s, origin } = await startServer([discoveredTraefikIp]);
		server = s;

		const response = await fetch(`${origin}${REAL_PATH}`, {
			headers: {
				'x-forwarded-host': FORGED_HOST,
				'x-forwarded-proto': FORGED_PROTO,
			},
		});
		const html = await response.text();

		// The forged host is NOT accepted — origin falls back to socket.
		expect(extractCanonical(html)).not.toContain(FORGED_HOST);
		expect(extractOgUrl(html)).not.toContain(FORGED_HOST);
		expect(extractCanonical(html)).toContain(HOST);
		expect(extractOgUrl(html)).toContain(HOST);
	});
});
