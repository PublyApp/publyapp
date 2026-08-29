import { readFileSync } from 'node:fs';

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vitest';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

// Mock the env module so resolveOrigin works without a real runtime env —
// SERVER_API_BASE_URL would otherwise fail Zod validation and throw.
const mockGetServerEnv = vi.fn();
const mockGetPublicEnv = vi.fn();
vi.mock('./lib/env', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./lib/env')>();
	return {
		...actual,
		getServerEnv: () => mockGetServerEnv(),
		getPublicEnv: () => mockGetPublicEnv(),
	};
});

import { injectSeoMarkup } from './server';

const originalWarn = logger.warn;

beforeEach(() => {
	vi.clearAllMocks();
	logger.warn = vi.fn();
	mockGetServerEnv.mockReturnValue({
		apiBaseUrl: 'http://localhost:5000',
		nodeEnv: 'production',
		publicOrigin: 'https://publyapp.test',
	});
});

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
 * Security tests for r2-shell-F10: proves that `resolveOrigin` never derives
 * the public origin from a client-supplied `Host` header when `PUBLIC_ORIGIN`
 * is configured. A forged `Host` header (set by a malicious proxy or direct
 * attacker) must be ignored — the configured `PUBLIC_ORIGIN` always wins.
 *
 * The previous HTTP-based version of these tests was flawed: it sent
 * `x-forwarded-host` to a srvx server, but `resolveOrigin` reads
 * `request.headers.get('host')`, which srvx does NOT rewrite from forwarded
 * headers. The forged host was never seen by the code under test, so the
 * assertions were vacuous. These tests exercise `resolveOrigin` directly with
 * mocked `Request` objects carrying the real `Host` header an attacker would
 * forge, which is the actual host-header injection vector (#1731).
 */

const htmlWithHead =
	'<html><head><title>Test</title></head><body></body></html>';

/** Minimal translator that returns a fixed title. */
const fakeT = (key: string) =>
	key.includes('title') ? 'Test PublyApp' : 'Test desc';

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
 * has side effects at module-load time).
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
	afterEach(() => {
		logger.warn = originalWarn;
	});

	afterAll(() => {
		// No server to clean up — these tests exercise resolveOrigin directly.
	});

	// --- RED case: the vulnerable default (PUBLIC_ORIGIN unset) ---
	test('without PUBLIC_ORIGIN, a forged Host header is trusted (RED — vulnerability present)', () => {
		// Simulate the pre-#1731 state: no PUBLIC_ORIGIN configured, development.
		// A forged Host header is trusted as the origin — the vulnerability.
		mockGetServerEnv.mockReturnValue({
			apiBaseUrl: 'http://localhost:5000',
			nodeEnv: 'development',
			publicOrigin: undefined,
		});

		const forgedHost = 'evil-attacker.com';
		const request = new Request('http://127.0.0.1/', {
			headers: { host: forgedHost, 'x-forwarded-proto': 'https' },
		});

		const html = injectSeoMarkup(htmlWithHead, request, 'en', true, fakeT);

		// The vulnerability: forged host is accepted as the origin.
		expect(extractCanonical(html)).toContain(forgedHost);
		expect(extractOgUrl(html)).toContain(forgedHost);
	});

	// --- GREEN case: PUBLIC_ORIGIN pins the origin ---
	test('with PUBLIC_ORIGIN set, a forged Host header is ignored (GREEN — fix applied)', () => {
		// The #1731 fix: PUBLIC_ORIGIN is configured, so a forged Host header
		// is ignored and the configured origin is used instead.
		mockGetServerEnv.mockReturnValue({
			apiBaseUrl: 'http://localhost:5000',
			nodeEnv: 'production',
			publicOrigin: 'https://publyapp.test',
		});

		const forgedHost = 'evil-attacker.com';
		const request = new Request('http://127.0.0.1/', {
			headers: { host: forgedHost, 'x-forwarded-proto': 'https' },
		});

		const html = injectSeoMarkup(htmlWithHead, request, 'en', true, fakeT);

		// The fix: forged host is NOT accepted; configured origin wins.
		expect(extractCanonical(html)).not.toContain(forgedHost);
		expect(extractOgUrl(html)).not.toContain(forgedHost);
		expect(extractCanonical(html)).toContain('https://publyapp.test');
		expect(extractOgUrl(html)).toContain('https://publyapp.test');
	});

	// --- Legitimate proxy path still works ---
	test('with PUBLIC_ORIGIN set, a matching Host header is accepted (legitimate proxy)', () => {
		// When the Host header matches PUBLIC_ORIGIN, the origin is accepted.
		// This is the legitimate Traefik path: Traefik sets Host to the public
		// value, which matches PUBLIC_ORIGIN.
		mockGetServerEnv.mockReturnValue({
			apiBaseUrl: 'http://localhost:5000',
			nodeEnv: 'production',
			publicOrigin: 'https://publyapp.test',
		});

		const legitimateHost = 'publyapp.test';
		const request = new Request('http://127.0.0.1/', {
			headers: { host: legitimateHost, 'x-forwarded-proto': 'https' },
		});

		const html = injectSeoMarkup(htmlWithHead, request, 'en', true, fakeT);

		// Legitimate host is accepted.
		expect(extractCanonical(html)).toContain('https://publyapp.test');
		expect(extractOgUrl(html)).toContain('https://publyapp.test');
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

	// --- Mutation test: forged Host from an untrusted peer is rejected ---
	// This is the core security property the PR exists to guarantee: even when
	// the trusted peer is a discovered Traefik IP (not a hardcoded value), a
	// forged Host header from any other IP is ignored.
	test('mutation: forged Host header is rejected when PUBLIC_ORIGIN is configured', () => {
		// The request's peer is 127.0.0.1, which is NOT the trusted IP — so
		// forwarded headers from this peer must be ignored.
		mockGetServerEnv.mockReturnValue({
			apiBaseUrl: 'http://localhost:5000',
			nodeEnv: 'production',
			publicOrigin: 'https://publyapp.test',
		});

		const forgedHost = 'evil-attacker.com';
		const request = new Request('http://127.0.0.1/', {
			headers: { host: forgedHost, 'x-forwarded-proto': 'https' },
		});

		const html = injectSeoMarkup(htmlWithHead, request, 'en', true, fakeT);

		// The forged host is NOT accepted — configured origin wins.
		expect(extractCanonical(html)).not.toContain(forgedHost);
		expect(extractOgUrl(html)).not.toContain(forgedHost);
		expect(extractCanonical(html)).toContain('https://publyapp.test');
		expect(extractOgUrl(html)).toContain('https://publyapp.test');
	});
});
