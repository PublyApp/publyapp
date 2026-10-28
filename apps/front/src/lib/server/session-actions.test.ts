import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createClient: vi.fn(),
	readSessionTokensFromCookie: vi.fn(),
	revokeSessionPost: vi.fn(),
	setCookie: vi.fn(),
	setResponseHeader: vi.fn(),
}));

type ServerFnStub = {
	validator: (fn: unknown) => ServerFnStub;
	handler: (handlerFn: () => void) => () => void;
};

/**
 * `createServerFn`'s real implementation needs an AsyncLocalStorage "start
 * context" that only exists inside the actual server runtime, so these unit
 * tests exercise the handler bodies directly through a minimal
 * `.validator().handler()` chain (same stub shape as `auth-actions.test.ts`).
 */
vi.mock('@tanstack/react-start', () => {
	const chain: ServerFnStub = {
		validator: () => chain,
		handler: (handlerFn) => () => handlerFn(),
	};
	return { createServerFn: () => chain };
});

vi.mock('@tanstack/react-start/server', () => ({
	setCookie: mocks.setCookie,
	setResponseHeader: mocks.setResponseHeader,
}));

vi.mock('../api-client/client-manager', () => ({
	createClient: mocks.createClient,
}));

vi.mock('./session-cookie-utils', () => ({
	buildTenantSessionCookie: vi.fn(),
	getCookieOptions: vi.fn(),
	readSessionCookieValue: vi.fn(),
	readSessionTokensFromCookie: mocks.readSessionTokensFromCookie,
}));

import { SESSION_TOKEN_COOKIE_KEY } from '@org/shared-ts/lib/constants';

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { clearSession } from './session-actions';

describe('clearSession', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createClient.mockReturnValue({
			auth: { revokeSession: { post: mocks.revokeSessionPost } },
		});
		mocks.revokeSessionPost.mockResolvedValue({ status: 'success' });
	});

	test('revokes every session the cookie presents before clearing the cookie', async () => {
		mocks.readSessionTokensFromCookie.mockReturnValue({
			staffToken: 'staff-token',
			tenantToken: 'tenant-token',
		});

		await clearSession();

		expect(mocks.revokeSessionPost).toHaveBeenCalledTimes(2);
		expect(
			mocks.createClient.mock.calls.map(([options]) =>
				options.getSessionToken(),
			),
		).toEqual(['staff-token', 'tenant-token']);
		expect(mocks.setResponseHeader).toHaveBeenCalledWith(
			'Set-Cookie',
			expect.stringContaining(SESSION_TOKEN_COOKIE_KEY),
		);
		expect(mocks.revokeSessionPost.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.setResponseHeader.mock.invocationCallOrder[0],
		);
	});

	test('revokes a token only once when the cookie repeats it', async () => {
		mocks.readSessionTokensFromCookie.mockReturnValue({
			staffToken: 'same-token',
			tenantToken: 'same-token',
		});

		await clearSession();

		expect(mocks.revokeSessionPost).toHaveBeenCalledTimes(1);
	});

	test('clears the cookie when the API refuses to revoke (e.g. impersonation session)', async () => {
		mocks.readSessionTokensFromCookie.mockReturnValue({
			tenantToken: 'impersonation-token',
		});
		mocks.revokeSessionPost.mockRejectedValue(new Error('403 Forbidden'));

		await expect(clearSession()).resolves.toBeUndefined();

		expect(mocks.setResponseHeader).toHaveBeenCalledWith(
			'Set-Cookie',
			expect.stringContaining(SESSION_TOKEN_COOKIE_KEY),
		);
	});

	test('clears the cookie without calling the API when no session is present', async () => {
		mocks.readSessionTokensFromCookie.mockReturnValue({});

		await clearSession();

		expect(mocks.createClient).not.toHaveBeenCalled();
		expect(mocks.revokeSessionPost).not.toHaveBeenCalled();
		expect(mocks.setResponseHeader).toHaveBeenCalledWith(
			'Set-Cookie',
			expect.stringContaining(SESSION_TOKEN_COOKIE_KEY),
		);
	});
});
