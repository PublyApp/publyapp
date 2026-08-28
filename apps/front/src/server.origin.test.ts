/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

// Mock the env module so we can control PUBLIC_ORIGIN per test
const mockGetServerEnv = vi.fn();
vi.mock('./lib/env', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./lib/env')>();
	return {
		...actual,
		getServerEnv: () => mockGetServerEnv(),
	};
});

// Import after mock
const { resolveOrigin } = await import('./server');

const originalWarn = logger.warn;

describe('resolveOrigin — host-header injection guard (A1/A5)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		logger.warn = originalWarn;
	});

	describe('A1 — forged Host header must not poison origin', () => {
		test('RED mutation: without PUBLIC_ORIGIN, a forged Host header is trusted (host-header injection)', () => {
			// Simulate the vulnerable path: PUBLIC_ORIGIN not set, attacker sends evil.example
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'development',
				publicOrigin: undefined,
			});

			const request = new Request('http://internal:3000/', {
				headers: { host: 'evil.example.com' },
			});

			const origin = resolveOrigin(request);

			// VULNERABLE: the forged host is returned as-is
			expect(origin).toBe('https://evil.example.com');
			// The fallback path logs a warning (A5 trace)
			expect(logger.warn).toHaveBeenCalledWith(
				'resolveOrigin: PUBLIC_ORIGIN not set, falling back to request host (host-header injection risk)',
			);
		});

		test('GREEN: with PUBLIC_ORIGIN set, a forged Host header is rejected and the configured origin is used', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'development',
				publicOrigin: 'https://publyapp.com',
			});

			const request = new Request('http://internal:3000/', {
				headers: { host: 'evil.example.com' },
			});

			const origin = resolveOrigin(request);

			// SECURE: the forged host is rejected, configured origin wins
			expect(origin).toBe('https://publyapp.com');
			expect(logger.warn).toHaveBeenCalledWith(
				'resolveOrigin: host header "evil.example.com" does not match PUBLIC_ORIGIN, using configured origin',
			);
		});

		test('GREEN: with PUBLIC_ORIGIN set, a matching Host header is accepted', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'development',
				publicOrigin: 'https://publyapp.com',
			});

			const request = new Request('https://publyapp.com/', {
				headers: { host: 'publyapp.com' },
			});

			const origin = resolveOrigin(request);

			expect(origin).toBe('https://publyapp.com');
			expect(logger.warn).not.toHaveBeenCalled();
		});

		test('GREEN: with PUBLIC_ORIGIN set and no Host header, configured origin is used', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'development',
				publicOrigin: 'https://publyapp.com',
			});

			// Request without Host header
			const request = new Request('http://internal:3000/');
			// Remove host header if present
			const headers = new Headers(request.headers);
			headers.delete('host');
			const requestWithoutHost = new Request('http://internal:3000/', {
				headers,
			});

			const origin = resolveOrigin(requestWithoutHost);

			expect(origin).toBe('https://publyapp.com');
		});
	});

	describe('A5 — silent fallback must leave a trace', () => {
		test('RED mutation: without PUBLIC_ORIGIN and no Host header, falls back to request URL origin with warning', () => {
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
			// But logs a warning (A5 trace)
			expect(logger.warn).toHaveBeenCalledWith(
				'resolveOrigin: no host header and PUBLIC_ORIGIN not set, falling back to request URL origin',
			);
		});
	});
});
