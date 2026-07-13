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

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: { error: vi.fn() },
}));

import { __resetLogoutInFlightForTests, useLogout } from './use-logout';

describe('useLogout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		__resetLogoutInFlightForTests();
		mocks.clear.mockResolvedValue(undefined);
		mocks.navigate.mockResolvedValue(undefined);
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
		await waitFor(() =>
			expect(mocks.queryClientClear).toHaveBeenCalledTimes(1),
		);

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

	test('clears the query cache only after navigation to /login has been initiated, not before (regression guard for 80a14aa5)', async () => {
		// Controllable navigate() promise: lets us assert the cache is still
		// untouched at the exact moment navigate() has been called but has not
		// yet settled, which a macrotask-based waitFor poll can't pin down on
		// its own (both the navigate-call and the cache-clear microtasks would
		// already have drained by the time the poll callback runs).
		let resolveNavigate: () => void = () => {};
		mocks.navigate.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveNavigate = resolve;
			}),
		);

		const { result } = renderHook(() => useLogout());

		act(() => {
			result.current.logout();
		});

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));

		// At the instant navigate() is invoked (and still unsettled) the cache
		// clear must not have run yet — otherwise still-mounted active queries
		// refetch against the now-cleared cache before the redirect takes
		// effect.
		expect(mocks.queryClientClear).not.toHaveBeenCalled();

		resolveNavigate();
		await waitFor(() =>
			expect(mocks.queryClientClear).toHaveBeenCalledTimes(1),
		);

		const navigateOrder = mocks.navigate.mock.invocationCallOrder[0];
		const queryClientClearOrder =
			mocks.queryClientClear.mock.invocationCallOrder[0];
		expect(navigateOrder).toBeLessThan(queryClientClearOrder);
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

		expect(mocks.clear).toHaveBeenCalledTimes(1);

		resolveClear();
		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(mocks.queryClientClear).toHaveBeenCalledTimes(1),
		);
	});

	test('dedupes concurrent logout calls from two independent hook instances (e.g. the QueryCache backstop and LogoutRedirect reacting to the same 401)', async () => {
		let resolveClear: () => void = () => {};
		mocks.clear.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveClear = resolve;
			}),
		);

		const first = renderHook(() => useLogout());
		const second = renderHook(() => useLogout());

		act(() => {
			first.result.current.logout({ redirectCause: 'invalid_session' });
		});
		act(() => {
			second.result.current.logout({ redirectCause: 'invalid_session' });
		});

		expect(mocks.clear).toHaveBeenCalledTimes(1);

		resolveClear();
		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
		await waitFor(() =>
			expect(mocks.queryClientClear).toHaveBeenCalledTimes(1),
		);

		expect(mocks.postBroadcast).toHaveBeenCalledTimes(1);
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/login',
			search: { rc: 'invalid_session' },
			replace: true,
		});

		first.unmount();
		second.unmount();
	});

	test('allows a fresh logout after a prior deduped attempt settles (e.g. logging back in and out again)', async () => {
		const { result } = renderHook(() => useLogout());

		act(() => {
			result.current.logout();
		});
		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));

		vi.clearAllMocks();
		mocks.clear.mockResolvedValue(undefined);

		act(() => {
			result.current.logout();
		});
		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));

		expect(mocks.clear).toHaveBeenCalledTimes(1);
	});

	test('does not navigate when the server-side session clear fails, and allows retrying', async () => {
		mocks.clear.mockRejectedValueOnce(new Error('network error'));

		const { result } = renderHook(() => useLogout());

		act(() => {
			result.current.logout();
		});
		expect(result.current.isLoggingOut).toBe(true);

		await waitFor(() => expect(result.current.isLoggingOut).toBe(false));

		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.postBroadcast).not.toHaveBeenCalled();

		mocks.clear.mockResolvedValueOnce(undefined);
		act(() => {
			result.current.logout();
		});

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
	});
});
