import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

// Mock the env module so we can control PUBLIC_ORIGIN per test
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

// Import after mock
const { resolveOrigin, validateRuntimeEnv } = await import('./server');

// `vi.spyOn` takes the object and a string — no `logger.warn` in value position,
// so typescript/unbound-method has nothing to flag, and vitest keeps the spy
// identity intact. `vi.restoreAllMocks()` in afterEach puts the real method back.
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();
	warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('resolveOrigin — host-header injection guard (A1/A5)', () => {
	describe('Production refuses to trust a forged Host header', () => {
		test('without PUBLIC_ORIGIN, resolveOrigin throws instead of trusting the forged Host header', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'production',
				publicOrigin: undefined,
			});

			const request = new Request('http://internal:3000/', {
				headers: { host: 'evil.example.com' },
			});

			// Must NOT return the forged host — must throw
			expect(() => resolveOrigin(request)).toThrow(
				'PUBLIC_ORIGIN is required in production; resolveOrigin must not trust the Host header.',
			);
		});

		test('without PUBLIC_ORIGIN and no Host header, resolveOrigin throws', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'production',
				publicOrigin: undefined,
			});

			const request = new Request('http://internal:3000/');
			const headers = new Headers(request.headers);
			headers.delete('host');
			const requestWithoutHost = new Request('http://internal:3000/', {
				headers,
			});

			expect(() => resolveOrigin(requestWithoutHost)).toThrow(
				'PUBLIC_ORIGIN is required in production; resolveOrigin must not trust the Host header.',
			);
		});

		test('validateRuntimeEnv throws at startup when PUBLIC_ORIGIN is absent in production', () => {
			mockGetPublicEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
			});
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'production',
				publicOrigin: undefined,
			});

			expect(() => validateRuntimeEnv()).toThrow(
				"PUBLIC_ORIGIN is required when NODE_ENV=production: without it the server trusts the client's Host header when building canonical and Open Graph URLs. Set PUBLIC_ORIGIN to the public https origin (for example https://app.publy.example), no trailing path.",
			);
		});
	});

	describe('A1 — forged Host header must not poison origin', () => {
		test('GREEN: with PUBLIC_ORIGIN set, a forged Host header is rejected and the configured origin is used', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'production',
				publicOrigin: 'https://publyapp.com',
			});

			const request = new Request('http://internal:3000/', {
				headers: { host: 'evil.example.com' },
			});

			const origin = resolveOrigin(request);

			// Must NOT return the forged host — must return the configured origin
			expect(origin).toBe('https://publyapp.com');
			// The mismatch is logged
			expect(warnSpy).toHaveBeenCalledWith(
				'resolveOrigin: request host https://evil.example.com does not match PUBLIC_ORIGIN https://publyapp.com; using configured origin',
			);
		});

		test('GREEN: with PUBLIC_ORIGIN set, a matching Host header is accepted', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'production',
				publicOrigin: 'https://publyapp.com',
			});

			const request = new Request('http://internal:3000/', {
				headers: { host: 'publyapp.com' },
			});

			const origin = resolveOrigin(request);

			expect(origin).toBe('https://publyapp.com');
			expect(warnSpy).not.toHaveBeenCalled();
		});

		test('GREEN: with PUBLIC_ORIGIN set and no Host header, configured origin is used', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'production',
				publicOrigin: 'https://publyapp.com',
			});

			const request = new Request('http://internal:3000/');
			const headers = new Headers(request.headers);
			headers.delete('host');
			const requestWithoutHost = new Request('http://internal:3000/', {
				headers,
			});

			const origin = resolveOrigin(requestWithoutHost);

			expect(origin).toBe('https://publyapp.com');
			expect(warnSpy).not.toHaveBeenCalled();
		});
	});

	describe('A5 — development fallback to request host is allowed with a warning', () => {
		test('in development only, without PUBLIC_ORIGIN, a forged Host header is trusted and a warning is logged', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'development',
				publicOrigin: undefined,
			});

			const request = new Request('http://internal:3000/', {
				headers: { host: 'evil.example.com' },
			});

			const origin = resolveOrigin(request);

			// In development, the fallback to the request host is acceptable
			expect(origin).toBe('https://evil.example.com');
			expect(warnSpy).toHaveBeenCalledWith(
				'resolveOrigin: PUBLIC_ORIGIN not set, falling back to request host (host-header injection risk)',
			);
		});

		test('in development only, without PUBLIC_ORIGIN and no Host header, falls back to request URL origin with warning', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'development',
				publicOrigin: undefined,
			});

			const request = new Request('http://internal:3000/');
			const headers = new Headers(request.headers);
			headers.delete('host');
			const requestWithoutHost = new Request('http://internal:3000/', {
				headers,
			});

			const origin = resolveOrigin(requestWithoutHost);

			// Falls back to request URL origin
			expect(origin).toBe('http://internal:3000');
			expect(warnSpy).toHaveBeenCalledWith(
				'resolveOrigin: no host header and PUBLIC_ORIGIN not set, falling back to request URL origin',
			);
		});

		test('in development, validateRuntimeEnv does not throw when PUBLIC_ORIGIN is absent', () => {
			mockGetPublicEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
			});
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'development',
				publicOrigin: undefined,
			});

			expect(() => validateRuntimeEnv()).not.toThrow();
		});
	});
});
