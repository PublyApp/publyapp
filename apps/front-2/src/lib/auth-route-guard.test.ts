/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	redirect: vi.fn((opts: Record<string, unknown>) => ({
		isRedirect: true,
		...opts,
	})),
	getSessionTokensFromBrowser: vi.fn(),
	completeLoginRedirect: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	redirect: mocks.redirect,
}));

vi.mock('./api-client/client-manager', () => ({
	getSessionTokensFromBrowser: mocks.getSessionTokensFromBrowser,
}));

vi.mock('./server/session-actions', () => ({
	completeLoginRedirect: mocks.completeLoginRedirect,
}));

import { redirectAuthenticatedUserAwayFromAuthPage } from './auth-route-guard';

describe('redirectAuthenticatedUserAwayFromAuthPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getSessionTokensFromBrowser.mockReturnValue({});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('stays on the auth page when there is no session cookie', async () => {
		mocks.getSessionTokensFromBrowser.mockReturnValue({});

		await expect(
			redirectAuthenticatedUserAwayFromAuthPage(),
		).resolves.toBeUndefined();
		expect(mocks.completeLoginRedirect).not.toHaveBeenCalled();
	});

	test('redirects to the resolved workspace when a session exists', async () => {
		mocks.getSessionTokensFromBrowser.mockReturnValue({
			tenantToken: 'tenant-token',
		});
		mocks.completeLoginRedirect.mockResolvedValue({ targetPath: '/tenant' });

		await expect(redirectAuthenticatedUserAwayFromAuthPage()).rejects.toEqual({
			isRedirect: true,
			to: '/tenant',
			replace: true,
		});
		expect(mocks.completeLoginRedirect).toHaveBeenCalledWith({ data: {} });
	});

	test('stays on the auth page when the session is stale or invalid (401)', async () => {
		mocks.getSessionTokensFromBrowser.mockReturnValue({
			tenantToken: 'stale-token',
		});
		mocks.completeLoginRedirect.mockRejectedValue({
			responseStatusCode: 401,
			status: 401,
			title: 'Unauthorized',
			detail: 'missing session token',
		});

		await expect(
			redirectAuthenticatedUserAwayFromAuthPage(),
		).resolves.toBeUndefined();
		expect(mocks.redirect).not.toHaveBeenCalled();
	});

	test('stays on the auth page when the session has no accessible scope (403)', async () => {
		mocks.getSessionTokensFromBrowser.mockReturnValue({
			tenantToken: 'unauthorized-token',
		});
		mocks.completeLoginRedirect.mockRejectedValue({
			responseStatusCode: 403,
			status: 403,
			title: 'Forbidden',
			detail: 'user has no accessible scope',
		});

		await expect(
			redirectAuthenticatedUserAwayFromAuthPage(),
		).resolves.toBeUndefined();
		expect(mocks.redirect).not.toHaveBeenCalled();
	});

	test('stays on the auth page without crashing when the API is unreachable', async () => {
		mocks.getSessionTokensFromBrowser.mockReturnValue({
			tenantToken: 'tenant-token',
		});
		mocks.completeLoginRedirect.mockRejectedValue(
			new TypeError('Failed to fetch'),
		);

		await expect(
			redirectAuthenticatedUserAwayFromAuthPage(),
		).resolves.toBeUndefined();
		expect(mocks.redirect).not.toHaveBeenCalled();
	});
});
