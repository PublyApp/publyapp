/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	clear: vi.fn(),
	queryClientClear: vi.fn(),
	postBroadcast: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => mocks.navigate,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({ clear: mocks.queryClientClear }),
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

vi.mock('~/lib/server/session-actions', () => ({
	clearSession: mocks.clear,
}));

vi.mock('~/lib/tab-sync/broadcast-sync', () => ({
	AUTH_SYNC_CHANNEL: 'publyapp:auth-sync',
	postBroadcast: mocks.postBroadcast,
}));

import { useLogout } from './use-logout';

describe('useLogout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.clear.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test('clears the query cache and the server session, then navigates to /login without redirect_cause', async () => {
		const { result } = renderHook(() => useLogout());

		act(() => {
			result.current.logout();
		});

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));

		expect(mocks.queryClientClear).toHaveBeenCalledTimes(1);
		expect(mocks.clear).toHaveBeenCalledTimes(1);
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/login',
			search: undefined,
			replace: true,
		});
		expect(mocks.postBroadcast).toHaveBeenCalledWith('publyapp:auth-sync', {
			type: 'logout',
		});
	});

	test('passes redirect_cause=invalid_session through when requested (the LogoutRedirect path)', async () => {
		const { result } = renderHook(() => useLogout());

		act(() => {
			result.current.logout({ redirectCause: 'invalid_session' });
		});

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));

		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/login',
			search: { rc: 'invalid_session' },
			replace: true,
		});
		expect(mocks.postBroadcast).toHaveBeenCalledWith('publyapp:auth-sync', {
			type: 'logout',
		});
	});

	test('broadcasts logout only after the server-side session clear settles, before navigating', async () => {
		let resolveClear: () => void = () => {};
		mocks.clear.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveClear = resolve;
			}),
		);

		const { result } = renderHook(() => useLogout());

		act(() => {
			result.current.logout();
		});

		expect(mocks.postBroadcast).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();

		resolveClear();
		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));

		expect(mocks.postBroadcast).toHaveBeenCalledTimes(1);
		const broadcastOrder = mocks.postBroadcast.mock.invocationCallOrder[0];
		const navigateOrder = mocks.navigate.mock.invocationCallOrder[0];
		expect(broadcastOrder).toBeLessThan(navigateOrder);
	});

	test('ignores a second logout call while the first is still in flight', async () => {
		let resolveClear: () => void = () => {};
		mocks.clear.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveClear = resolve;
			}),
		);

		const { result } = renderHook(() => useLogout());

		act(() => {
			result.current.logout();
		});
		expect(result.current.isLoggingOut).toBe(true);

		act(() => {
			result.current.logout();
		});

		expect(mocks.queryClientClear).toHaveBeenCalledTimes(1);
		expect(mocks.clear).toHaveBeenCalledTimes(1);

		resolveClear();
		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
	});
});
