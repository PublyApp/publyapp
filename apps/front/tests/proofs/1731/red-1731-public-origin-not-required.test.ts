import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

// Mock the env module so we can control PUBLIC_ORIGIN per test
const mockGetServerEnv = vi.fn();
const mockGetPublicEnv = vi.fn();
vi.mock('../../../src/lib/env', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../src/lib/env')>();
	return {
		...actual,
		getServerEnv: () => mockGetServerEnv(),
		getPublicEnv: () => mockGetPublicEnv(),
	};
});

// Import after mock
const { resolveOrigin, validateRuntimeEnv } =
	await import('../../../src/server');

const originalWarn = logger.warn.bind(logger);

beforeEach(() => {
	vi.clearAllMocks();
	logger.warn = vi.fn();
});

afterEach(() => {
	logger.warn = originalWarn;
});

describe('Paired red proof #1731 — PUBLIC_ORIGIN required in production', () => {
	// This test asserts the VULNERABLE behavior: without PUBLIC_ORIGIN in production,
	// the server trusts the forged Host header. Against the corrected code, this test
	// must FAIL (red) because resolveOrigin now throws instead of trusting the host.
	// The mutation that makes this test pass again (restores the bug) is to remove
	// the production guard in resolveOrigin and validateRuntimeEnv.
	describe('RED: vulnerable behavior — forged Host header is trusted in production', () => {
		test('without PUBLIC_ORIGIN, a forged Host header is returned as-is (host-header injection)', () => {
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'production',
				publicOrigin: undefined,
			});

			const request = new Request('http://internal:3000/', {
				headers: { host: 'evil.example.com' },
			});

			const origin = resolveOrigin(request);

			// VULNERABLE: the forged host is returned as-is
			expect(origin).toBe('https://evil.example.com');
			// The fallback path logs a warning (A5 trace)
			expect(logger.warn.bind(logger)).toHaveBeenCalledWith(
				'resolveOrigin: PUBLIC_ORIGIN not set, falling back to request host (host-header injection risk)',
			);
		});

		test('validateRuntimeEnv does NOT throw when PUBLIC_ORIGIN is absent in production (no guard)', () => {
			mockGetPublicEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
			});
			mockGetServerEnv.mockReturnValue({
				apiBaseUrl: 'http://localhost:5000',
				nodeEnv: 'production',
				publicOrigin: undefined,
			});

			// VULNERABLE: no guard, startup succeeds without PUBLIC_ORIGIN
			expect(() => validateRuntimeEnv()).not.toThrow();
		});
	});
});
