/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	triggerSessionInvalidated: vi.fn(),
}));

vi.mock('~/lib/session-invalidation-channel', () => ({
	triggerSessionInvalidated: mocks.triggerSessionInvalidated,
}));

import {
	getRouter,
	handleAuthedQueryError,
	isAuthedSurfacePath,
} from './router';

describe('getRouter', () => {
	test('the QueryClient defaults to a non-zero staleTime so a tab refocus does not stampede every mounted query', () => {
		const router = getRouter();
		const { staleTime } = router.options.context.queryClient.getDefaultOptions()
			.queries as { staleTime?: number };

		expect(staleTime).toBeGreaterThan(0);
	});

	test('wires the authed-query-error backstop into both the query cache and the mutation cache', () => {
		// `setupRouterSsrQueryIntegration` wraps the cache's `onError` rather
		// than replacing it, so this asserts on observable behavior (does the
		// wired handler still trigger the session-invalidation channel) —
		// checking `config.onError === handleAuthedQueryError` directly would
		// break the moment that wrapping changes shape, independent of
		// whether this backstop still fires. Real navigation (not a full
		// `window` stub) so `createRouter`'s internal `createBrowserHistory`
		// still has a working `window.history` to call into.
		window.history.pushState({}, '', '/staff/staff-users');
		mocks.triggerSessionInvalidated.mockClear();

		const router = getRouter();
		const { queryClient } = router.options.context;

		const authFailure = {
			responseStatusCode: 401,
			title: 'Unauthorized',
		} as unknown as Error;

		queryClient.getQueryCache().config.onError?.(authFailure, {} as never);
		expect(mocks.triggerSessionInvalidated).toHaveBeenCalledTimes(1);

		queryClient
			.getMutationCache()
			.config.onError?.(
				authFailure,
				undefined,
				undefined,
				{} as never,
				{} as never,
			);
		expect(mocks.triggerSessionInvalidated).toHaveBeenCalledTimes(2);

		window.history.pushState({}, '', '/');
	});
});

describe('isAuthedSurfacePath', () => {
	test('matches /staff and /tenant paths', () => {
		expect(isAuthedSurfacePath('/staff/tenants')).toBe(true);
		expect(isAuthedSurfacePath('/tenant')).toBe(true);
	});

	test('does not match auth or marketing paths', () => {
		expect(isAuthedSurfacePath('/login')).toBe(false);
		expect(isAuthedSurfacePath('/accept-invitation')).toBe(false);
		expect(isAuthedSurfacePath('/pricing')).toBe(false);
	});
});

describe('handleAuthedQueryError', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('triggers session invalidation for a 401 on an authed-surface path', () => {
		vi.stubGlobal('window', {
			location: { pathname: '/staff/staff-users' },
		});

		handleAuthedQueryError({ responseStatusCode: 401, title: 'Unauthorized' });

		expect(mocks.triggerSessionInvalidated).toHaveBeenCalledTimes(1);
	});

	test('does not trigger for a 403 on an authed-surface path', () => {
		vi.stubGlobal('window', {
			location: { pathname: '/staff/staff-users' },
		});

		handleAuthedQueryError({ responseStatusCode: 403, title: 'Forbidden' });

		expect(mocks.triggerSessionInvalidated).not.toHaveBeenCalled();
	});

	test('does not trigger for a 401 on the auth surface (e.g. accept-invitation)', () => {
		vi.stubGlobal('window', {
			location: { pathname: '/accept-invitation' },
		});

		handleAuthedQueryError({ responseStatusCode: 401, title: 'Unauthorized' });

		expect(mocks.triggerSessionInvalidated).not.toHaveBeenCalled();
	});
});
