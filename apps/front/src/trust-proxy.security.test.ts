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
 *
 * Throws on universal CIDRs (`/0`) and on any CIDR whose prefix-length suffix
 * is empty, non-numeric, or outside the valid range for the address family —
 * srvx uses exact string matching, not subnet matching, so `0.0.0.0` matches no
 * real peer and every client appears as the proxy's own address, silently
 * breaking per-IP rate limiting and audit logging. A value the parser cannot
 * honor must never be silently coerced to a "safe" default.
 */
const resolveTrustProxyFromEnv = (envValue: string | undefined): string[] => {
	const raw = envValue?.trim();
	if (!raw) {
		return ['127.0.0.1', '::1'];
	}
	const entries = raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	// Parse CIDR suffix numerically to catch equivalent forms like /00, /000 —
	// all are prefix-length 0, the universal wildcard. Also reject any suffix
	// that is empty, non-numeric, or outside the valid range for the address
	// family — an unreadable prefix length must fail startup, not be silently
	// coerced to a bare address.
	for (const entry of entries) {
		const slashIdx = entry.lastIndexOf('/');
		if (slashIdx === -1) continue;
		const addrPart = entry.slice(0, slashIdx);
		const suffix = entry.slice(slashIdx + 1);
		if (!/^\d+$/.test(suffix)) {
			throw new Error(
				`Refusing to start: TRUSTED_PROXY_CIDRS contains '${entry}' with an unreadable prefix length ` +
					`(expected decimal digits, got '${suffix || '<empty>'}'). ` +
					`Give the exact proxy address followed by /32 (IPv4) or /128 (IPv6), e.g. '10.0.0.9/32'.`,
			);
		}
		const prefixLength = Number.parseInt(suffix, 10);
		const isIpv6 = addrPart.includes(':');
		const maxPrefix = isIpv6 ? 128 : 32;
		if (prefixLength > maxPrefix) {
			throw new Error(
				`Refusing to start: TRUSTED_PROXY_CIDRS contains '${entry}' with prefix length ${prefixLength}, ` +
					`above the ${isIpv6 ? 'IPv6' : 'IPv4'} maximum of ${maxPrefix}. ` +
					`Give the exact proxy address followed by /32 (IPv4) or /128 (IPv6), e.g. '10.0.0.9/32'.`,
			);
		}
		if (prefixLength === 0) {
			throw new Error(
				`Refusing to start: TRUSTED_PROXY_CIDRS contains universal CIDR '${entry}', ` +
					`which would silently break per-IP rate limiting and audit logging. ` +
					`Replace it with the proxy's exact address as /32 (IPv4) or /128 (IPv6), ` +
					`e.g. '10.0.0.9/32'.`,
			);
		}
	}
	return entries.map((entry) => entry.split('/')[0]);
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

// --- R7: universal CIDR rejection at startup ---
// Three documents (first-deploy-runbook.md, production-deploy-runbook.md,
// api-rate-limiting.md) claim that `0.0.0.0/0` and `::/0` are rejected at
// startup. The code silently stripped the `/0` suffix, turning `0.0.0.0/0`
// into `0.0.0.0` — which with srvx's exact-string-matching semantics means
// NO peer is trusted, so every client appears as the proxy's own address,
// silently breaking per-IP rate limiting and audit logging.
describe('trust-proxy universal CIDR rejection (r7)', () => {
	// --- RED/GREEN pair: universal CIDR is rejected after the fix, accepted before ---
	test('rejects IPv4 universal CIDR 0.0.0.0/0 at startup with loud error', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/0')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains universal CIDR '0\.0\.0\.0\/0'/,
		);
	});

	test('rejects IPv6 universal CIDR ::/0 at startup with loud error', () => {
		expect(() => resolveTrustProxyFromEnv('::/0')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains universal CIDR '::\/0'/,
		);
	});

	test('rejects universal CIDR embedded in CSV list', () => {
		expect(() => resolveTrustProxyFromEnv('10.0.0.9/32,0.0.0.0/0')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains universal CIDR '0\.0\.0\.0\/0'/,
		);
	});

	test('rejection message names the offender and says what to put instead', () => {
		try {
			resolveTrustProxyFromEnv('0.0.0.0/0');
			expect.unreachable('should have thrown');
		} catch (error) {
			const message = String(error);
			expect(message).toContain('0.0.0.0/0');
			expect(message).toContain('/32');
			expect(message).toContain('/128');
		}
	});

	// --- Adversarial mutation: gestures that could re-introduce acceptance ---
	// A fix that only checks `=== '0.0.0.0/0'` could be bypassed with
	// `0.0.0.0/00`, `0.0.0.0/0 `, ` 0.0.0.0/0 `, or `0.0.0.0\0/0`. Our check
	// uses `Number.parseInt` on a regex-validated decimal suffix — verify these
	// are all caught.
	test('adversarial mutation: /00 suffix is caught (0.0.0.0/00)', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/00')).toThrow(
			/Refusing to start/,
		);
	});

	test('adversarial mutation: leading/trailing whitespace is caught', () => {
		expect(() => resolveTrustProxyFromEnv('  0.0.0.0/0  ')).toThrow(
			/Refusing to start/,
		);
	});

	test('adversarial mutation: mixed case is caught (::/0 vs ::/0)', () => {
		expect(() => resolveTrustProxyFromEnv('::/0')).toThrow(/Refusing to start/);
	});

	// What does NOT bypass: a non-universal CIDR that ends in 0 but is not /0
	// (e.g. `10.0.0.0/8`) — these are valid broad CIDRs that srvx will treat as
	// exact-match (correctly failing to match real peers). The /0 check only
	// rejects the universal-wildcard shape.
	test('non-universal /8 CIDR is NOT rejected (srvx handles it as exact match)', () => {
		expect(resolveTrustProxyFromEnv('10.0.0.0/8')).toEqual(['10.0.0.0']);
	});

	// --- R8: the three holes in the universal-CIDR rejection ---
	// The previous `Number.parseInt(suffix, 10) === 0` check let three shapes
	// through: empty suffix (`0.0.0.0/`), non-numeric suffix (`0.0.0.0/abc`), and
	// out-of-range suffix (`0.0.0.0/33`). Each survived the filter, was reduced
	// to a bare address by the `.split('/')[0]` map, and ended up in the trust
	// list. The same holes exist for IPv6 (`::/`, `::/abc`). An unreadable
	// prefix length must fail startup, not be silently coerced.
	test('R8 hole 1: empty IPv4 suffix 0.0.0.0/ is rejected', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains '0\.0\.0\.0\/' with an unreadable prefix length/,
		);
	});

	test('R8 hole 2: non-numeric IPv4 suffix 0.0.0.0/abc is rejected', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/abc')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains '0\.0\.0\.0\/abc' with an unreadable prefix length/,
		);
	});

	test('R8 hole 3: empty IPv6 suffix ::/ is rejected', () => {
		expect(() => resolveTrustProxyFromEnv('::/')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains '::\/' with an unreadable prefix length/,
		);
	});

	test('R8 hole 4: non-numeric IPv6 suffix ::/abc is rejected', () => {
		expect(() => resolveTrustProxyFromEnv('::/abc')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains '::\/abc' with an unreadable prefix length/,
		);
	});

	test('R8 hole 5: out-of-range IPv4 suffix 0.0.0.0/33 is rejected', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/33')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains '0\.0\.0\.0\/33' with prefix length 33/,
		);
	});

	test('R8 hole 6: out-of-range IPv6 suffix ::/129 is rejected', () => {
		expect(() => resolveTrustProxyFromEnv('::/129')).toThrow(
			/Refusing to start: TRUSTED_PROXY_CIDRS contains '::\/129' with prefix length 129/,
		);
	});

	// --- R8 adversarial mutation: regex removal ---
	// If the regex guard is dropped and only the numeric range checks remain,
	// `0.0.0.0/abc` slips through: `parseInt('abc')` is NaN, NaN > 32 is false,
	// NaN === 0 is false, so no throw. The regex is load-bearing.
	test('R8 adversarial: regex is load-bearing — 0.0.0.0/abc throws even if range checks are weak', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/abc')).toThrow(
			/unreadable prefix length/,
		);
	});

	test('R8 adversarial: regex is load-bearing — 0.0.0.0/3x throws (trailing junk)', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/3x')).toThrow(
			/unreadable prefix length/,
		);
	});

	test('R8 adversarial: regex is load-bearing — 0.0.0.0/ 3 throws (space in suffix)', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/ 3')).toThrow(
			/unreadable prefix length/,
		);
	});

	test('R8 adversarial: regex is load-bearing — 0.0.0.0/+3 throws (sign in suffix)', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/+3')).toThrow(
			/unreadable prefix length/,
		);
	});

	test('R8 adversarial: regex is load-bearing — 0.0.0.0/3.5 throws (decimal in suffix)', () => {
		expect(() => resolveTrustProxyFromEnv('0.0.0.0/3.5')).toThrow(
			/unreadable prefix length/,
		);
	});

	// --- R8 non-regression: bare addresses without slash are valid srvx entries ---
	test('R8 non-regression: bare IPv4 address without slash is accepted as-is', () => {
		expect(resolveTrustProxyFromEnv('10.0.0.9')).toEqual(['10.0.0.9']);
	});

	test('R8 non-regression: bare IPv6 address without slash is accepted as-is', () => {
		expect(resolveTrustProxyFromEnv('::1')).toEqual(['::1']);
	});

	// --- R8 non-regression: existing behavior is preserved ---
	test('R8 non-regression: /32 is accepted', () => {
		expect(resolveTrustProxyFromEnv('10.0.0.9/32')).toEqual(['10.0.0.9']);
	});

	test('R8 non-regression: CSV list is accepted', () => {
		expect(resolveTrustProxyFromEnv('10.0.0.9/32,10.0.0.10/32')).toEqual([
			'10.0.0.9',
			'10.0.0.10',
		]);
	});

	test('R8 non-regression: absent value falls back to loopback', () => {
		expect(resolveTrustProxyFromEnv(undefined)).toEqual(['127.0.0.1', '::1']);
		expect(resolveTrustProxyFromEnv('')).toEqual(['127.0.0.1', '::1']);
		expect(resolveTrustProxyFromEnv('   ')).toEqual(['127.0.0.1', '::1']);
	});

	test('R8 non-regression: IPv6 /128 is accepted', () => {
		expect(resolveTrustProxyFromEnv('::1/128')).toEqual(['::1']);
	});

	test('R8 non-regression: mixed IPv4+IPv6 CSV is accepted', () => {
		expect(resolveTrustProxyFromEnv('127.0.0.1/32,::1/128')).toEqual([
			'127.0.0.1',
			'::1',
		]);
	});
});
