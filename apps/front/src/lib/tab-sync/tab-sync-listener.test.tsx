/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type Handler = (data: unknown) => void;

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	invalidate: vi.fn(),
	queryClientClear: vi.fn(),
	invalidateQueries: vi.fn(),
	applyRemoteColorScheme: vi.fn(),
	pathname: '/staff/staff-users',
	authHandler: null as Handler | null,
	themeHandler: null as Handler | null,
	localeHandler: null as Handler | null,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		clear: mocks.queryClientClear,
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	useLocation: ({
		select,
	}: {
		select: (location: { pathname: string }) => void;
	}) => select({ pathname: mocks.pathname }),
	useNavigate: () => mocks.navigate,
	useRouter: () => ({ invalidate: mocks.invalidate }),
}));

vi.mock('~/lib/store/ui-store', () => ({
	useUiStore: (selector: (state: Record<string, unknown>) => void) =>
		selector({ applyRemoteColorScheme: mocks.applyRemoteColorScheme }),
	withThemeTransitionSuppressed: (apply: () => void) => apply(),
}));

vi.mock('./broadcast-sync', () => ({
	AUTH_SYNC_CHANNEL: 'publyapp:auth-sync',
	THEME_SYNC_CHANNEL: 'publyapp:theme-sync',
	LOCALE_SYNC_CHANNEL: 'publyapp:locale-sync',
	useBroadcastSync: (channel: string, handler: Handler) => {
		if (channel === 'publyapp:auth-sync') {
			mocks.authHandler = handler;
		}
		if (channel === 'publyapp:theme-sync') {
			mocks.themeHandler = handler;
		}
		if (channel === 'publyapp:locale-sync') {
			mocks.localeHandler = handler;
		}
	},
}));

import { TabSyncListener } from './tab-sync-listener';

const mountListener = () => {
	render(createElement(TabSyncListener));
};

describe('TabSyncListener', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.navigate.mockResolvedValue(undefined);
		mocks.pathname = '/staff/staff-users';
		mocks.authHandler = null;
		mocks.themeHandler = null;
		mocks.localeHandler = null;
		document.documentElement.lang = 'en';
	});

	afterEach(() => {
		cleanup();
	});

	test('logout on an authed surface navigates to /login, then clears the query cache — not before (regression guard mirroring useLogout, shell r2-F6)', async () => {
		mocks.pathname = '/tenant/settings';
		mountListener();

		mocks.authHandler?.({ type: 'logout' });

		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/login',
			replace: true,
		});
		expect(mocks.queryClientClear).not.toHaveBeenCalled();

		await waitFor(() =>
			expect(mocks.queryClientClear).toHaveBeenCalledTimes(1),
		);

		const navigateOrder = mocks.navigate.mock.invocationCallOrder[0];
		const queryClientClearOrder =
			mocks.queryClientClear.mock.invocationCallOrder[0];
		expect(navigateOrder).toBeLessThan(queryClientClearOrder);
	});

	test('logout on the login page skips navigation/cache-clear but still invalidates the current-user query', () => {
		mocks.pathname = '/login';
		mountListener();

		mocks.authHandler?.({ type: 'logout' });

		expect(mocks.queryClientClear).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['current-user'],
		});
	});

	test('logout on a marketing surface skips navigation/cache-clear but still invalidates the current-user query', () => {
		mocks.pathname = '/pricing';
		mountListener();

		mocks.authHandler?.({ type: 'logout' });

		expect(mocks.queryClientClear).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['current-user'],
		});
	});

	test('logout on the accept-invitation page invalidates the current-user query so a "signed in as" branch re-resolves (r3-users-auth F14)', () => {
		mocks.pathname = '/accept-invitation';
		mountListener();

		mocks.authHandler?.({ type: 'logout' });

		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['current-user'],
		});
	});

	test('login while parked on the login page re-runs the auth-page guard', () => {
		mocks.pathname = '/login';
		mountListener();

		mocks.authHandler?.({ type: 'login' });

		expect(mocks.invalidate).toHaveBeenCalledTimes(1);
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('login while parked on another auth screen (e.g. signup) re-runs the auth-page guard', () => {
		mocks.pathname = '/signup';
		mountListener();

		mocks.authHandler?.({ type: 'login' });

		expect(mocks.invalidate).toHaveBeenCalledTimes(1);
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('login while already on the authed surface only invalidates queries', () => {
		mocks.pathname = '/staff/staff-users';
		mountListener();

		mocks.authHandler?.({ type: 'login' });

		expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
		expect(mocks.invalidate).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('login on a marketing surface is ignored', () => {
		mocks.pathname = '/pricing';
		mountListener();

		mocks.authHandler?.({ type: 'login' });

		expect(mocks.invalidate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('ignores an auth message with an unknown type', () => {
		mocks.pathname = '/tenant/settings';
		mountListener();

		mocks.authHandler?.({ type: 'delete-everything' });

		expect(mocks.queryClientClear).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.invalidate).not.toHaveBeenCalled();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('applies a valid remote theme change', () => {
		mountListener();

		mocks.themeHandler?.({ colorScheme: 'dark' });

		expect(mocks.applyRemoteColorScheme).toHaveBeenCalledWith('dark');
	});

	test('ignores a theme message with an invalid colorScheme payload', () => {
		mountListener();

		mocks.themeHandler?.({ colorScheme: 'not-a-real-scheme' });

		expect(mocks.applyRemoteColorScheme).not.toHaveBeenCalled();
	});

	test('applies a valid remote locale change by invalidating the router', () => {
		document.documentElement.lang = 'en';
		mountListener();

		mocks.localeHandler?.({ locale: 'fr' });

		expect(mocks.invalidate).toHaveBeenCalledTimes(1);
	});

	test('ignores a remote locale message with an unsupported locale', () => {
		mountListener();

		mocks.localeHandler?.({ locale: 'de' });

		expect(mocks.invalidate).not.toHaveBeenCalled();
	});

	test('ignores a remote locale message matching the current locale (no echo)', () => {
		document.documentElement.lang = 'fr';
		mountListener();

		mocks.localeHandler?.({ locale: 'fr' });

		expect(mocks.invalidate).not.toHaveBeenCalled();
	});
});
