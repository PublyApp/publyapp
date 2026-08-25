/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ParsedSessionTokens } from '@org/shared-ts/lib/session/parse';

// PR #997 round 6 finding: the surface-redirect-code query key gained
// `hasAuthedRouteMatch` so the observer detaches (and the in-flight request
// aborts) the moment a route stops being an exact authenticated match — see
// __root.surface-query-cancellation.test.tsx. That correctly makes the
// [..., 'staff', true] entry *inactive* while the user sits on an unknown
// /staff/* path, and the installed TanStack Query browser default
// garbage-collects an inactive entry after five minutes. Without
// `gcTime: Infinity` alongside the existing `staleTime: Infinity`, a
// validated user who leaves a 404 open for more than five minutes and then
// goes back loses the cached validation result and re-fetches — this test
// proves the cached result survives past the default GC window.

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
	fetchCount: 0,
	isHydrated: true,
	matches: [] as MockMatch[],
	tokens: { staffToken: 'staff-tok' } satisfies ParsedSessionTokens,
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
	createClient: () => ({
		auth: {
			redirectCode: {
				get: () => {
					mocks.fetchCount += 1;
					return Promise.resolve({ redirectCode: 'staff' });
				},
			},
		},
	}),
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

// Fake timers advance the clock but do not, by themselves, drain a chain of
// already-resolved microtasks. `advanceTimersByTimeAsync(0)` yields once per
// call, so looping a few times drains the queryFn's promise chain
// (queryFn -> withSessionValidationTimeout -> parseRedirectCode -> mocked
// client call) between renders.
const flushMicrotasks = async () => {
	for (let i = 0; i < 10; i += 1) {
		await vi.advanceTimersByTimeAsync(0);
	}
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.useRealTimers();
	mocks.fetchCount = 0;
	mocks.isHydrated = true;
	mocks.matches = [];
	mocks.tokens = { staffToken: 'staff-tok' };
});

describe('surface-redirect-code query retention past the default GC window', () => {
	test('keeps the cached exact-match result alive across a >5-minute detour on an unknown route', async () => {
		vi.useFakeTimers();
		const queryClient = new QueryClient();
		mocks.matches = exactStaffMatches;

		const { rerender } = render(
			<QueryClientProvider client={queryClient}>
				<RoutedShell>
					<div />
				</RoutedShell>
			</QueryClientProvider>,
		);

		await flushMicrotasks();
		expect(mocks.fetchCount).toBe(1);

		// Client-side navigation to an unknown path under the same /staff
		// prefix: exactness is lost, so the [..., 'staff', true] entry becomes
		// inactive (its only observer moves to the disabled [..., 'staff',
		// false] key).
		mocks.matches = unknownStaffMatches;
		rerender(
			<QueryClientProvider client={queryClient}>
				<RoutedShell>
					<div />
				</RoutedShell>
			</QueryClientProvider>,
		);
		await flushMicrotasks();

		// Past the installed TanStack Query browser default gcTime (5 minutes).
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

		// Back to the exact match.
		mocks.matches = exactStaffMatches;
		rerender(
			<QueryClientProvider client={queryClient}>
				<RoutedShell>
					<div />
				</RoutedShell>
			</QueryClientProvider>,
		);
		await flushMicrotasks();

		expect(mocks.fetchCount).toBe(1);
	});
});
