import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getRequestHeader: vi.fn(),
	setCookie: vi.fn(),
	isProductionRuntime: vi.fn(),
}));

vi.mock('@tanstack/react-start/server', () => ({
	getRequestHeader: mocks.getRequestHeader,
	setCookie: mocks.setCookie,
}));

vi.mock('~/lib/env', () => ({
	isProductionRuntime: mocks.isProductionRuntime,
}));

import { getCookieOptions } from './session-cookie-utils';

describe('getCookieOptions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isProductionRuntime.mockReturnValue(false);
		mocks.getRequestHeader.mockImplementation(() => {
			throw new Error('no request header available in this test');
		});
	});

	test('sets Secure in production regardless of request headers (shell r2-F14 — a stripped X-Forwarded-Proto must not downgrade the cookie)', () => {
		mocks.isProductionRuntime.mockReturnValue(true);

		expect(getCookieOptions(undefined)?.secure).toBe(true);
		expect(mocks.getRequestHeader).not.toHaveBeenCalled();
	});

	test('falls back to sniffing the origin header outside production', () => {
		mocks.getRequestHeader.mockImplementation((name: string) =>
			name === 'origin' ? 'https://dev.publyapp.test' : undefined,
		);

		expect(getCookieOptions(undefined)?.secure).toBe(true);
	});

	test('falls back to sniffing x-forwarded-proto outside production', () => {
		mocks.getRequestHeader.mockImplementation((name: string) =>
			name === 'x-forwarded-proto' ? 'https, http' : undefined,
		);

		expect(getCookieOptions(undefined)?.secure).toBe(true);
	});

	test('does not set Secure outside production with no https signal at all', () => {
		expect(getCookieOptions(undefined)?.secure).toBe(false);
	});
});
