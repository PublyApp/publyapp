/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

// PR #997 finding 2: flipping `enabled` from true to false does NOT cancel an
// in-flight TanStack Query fetch while the observer and query key stay the
// same. Navigating client-side from a known /staff/* route to an unknown one
// keeps `getSessionSurface(pathname)` at 'staff' for both, so without the
// fix below the surface-redirect-code request from the *old* (exact-match)
// route keeps running and can settle into the cache after the route stopped
// matching. This test proves the fixed __root.tsx produces a real abort
// signal for that transition — not just that `withSessionValidationTimeout`
// forwards a signal it is handed (that is already covered by
// session-validation.test.ts).

type MockMatch = {
	_notFound?: boolean;
	pathname: string;
	routeId: string;
	search?: Record<string, unknown>;
};

const exactStaffMatches: MockMatch[] = [
	{ routeId: '__root__', pathname: '/' },
	{ routeId: '/_authed-layout', pathname: '/' },
	{
		pathname: '/staff/staff-users',
		routeId: '/_authed-layout/staff/staff-users',
	},
];

const unknownStaffMatches: MockMatch[] = [
	{ routeId: '__root__', pathname: '/' },
	{ _notFound: true, routeId: '/_authed-layout', pathname: '/' },
	{ pathname: '/staff/not-a-route', routeId: '/_authed-layout/staff' },
];

const mocks = vi.hoisted(() => ({
	capturedSignal: undefined as AbortSignal | undefined,
	isHydrated: true,
	matches: [] as MockMatch[],
	tokens: { staffToken: 'staff-tok' } as Record<string, unknown>,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('@tanstack/react-router')>();

	return {
		...actual,
		Link: ({ children, ...props }: React.ComponentProps<'a'>) => (
			<a {...props}>{children}</a>
		),
		useLocation: () => ({ pathname: '/staff/staff-users', searchStr: '' }),
		useMatches: ({ select }: { select: (matches: MockMatch[]) => void }) =>
			select(mocks.matches),
	};
});

vi.mock('react-i18next', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-i18next')>();

	return { ...actual, useTranslation: () => ({ t: (key: string) => key }) };
});

vi.mock('~/lib/hooks/use-hydrated', () => ({
	useHydrated: () => mocks.isHydrated,
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	createClient: ({ signal }: { signal?: AbortSignal }) => {
		mocks.capturedSignal = signal;
		return {
			auth: {
				redirectCode: {
					// Never resolves on its own — the test controls cancellation
					// only, exactly like the reviewer's QueryObserver probe.
					get: () => new Promise(() => undefined),
				},
			},
		};
	},
	getSessionTokensFromBrowser: () => mocks.tokens,
}));

vi.mock('~/layouts/auth-layout', () => ({
	AuthLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/layouts/marketing-layout', () => ({
	MarketingLayout: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));
vi.mock('~/layouts/authed-layout', () => ({
	AuthedLayout: ({ children }: { children: ReactNode }) => (
		<div data-testid="authed-layout-stub">{children}</div>
	),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { RoutedShell } from './__root';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.capturedSignal = undefined;
	mocks.isHydrated = true;
	mocks.matches = [];
	mocks.tokens = { staffToken: 'staff-tok' };
});

describe('surface-redirect-code query cancellation on route-exactness loss', () => {
	test('aborts the in-flight validation request once the route stops being an exact authed match', async () => {
		const queryClient = new QueryClient();
		mocks.matches = exactStaffMatches;

		const { rerender } = render(
			<QueryClientProvider client={queryClient}>
				<RoutedShell>
					<div />
				</RoutedShell>
			</QueryClientProvider>,
		);

		await vi.waitFor(() => {
			expect(mocks.capturedSignal).toBeDefined();
		});
		expect(mocks.capturedSignal?.aborted).toBe(false);

		// Client-side navigation to an unknown path under the same /staff
		// prefix: `getSessionSurface` still resolves to 'staff' for both, so
		// only `hasExactAuthedRouteMatch` flips.
		mocks.matches = unknownStaffMatches;
		rerender(
			<QueryClientProvider client={queryClient}>
				<RoutedShell>
					<div />
				</RoutedShell>
			</QueryClientProvider>,
		);

		await vi.waitFor(() => {
			expect(mocks.capturedSignal?.aborted).toBe(true);
		});
	});
});
