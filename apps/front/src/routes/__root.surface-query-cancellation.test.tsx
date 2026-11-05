/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ParsedSessionTokens } from '@org/shared-ts/lib/session/parse';

// Owner decision 04/11 (404 inside the shell) changed the older PR #997
// contract here: the surface-redirect-code entry is keyed per SURFACE, not
// per route exactness, because an unknown authed-prefix path must be able to
// READ the session a previous exact route already validated. Consequently the
// in-flight validation is deliberately NOT aborted when exactness is lost (its
// result is exactly what the in-shell 404 needs), and the unknown path must
// never start a second validation — that is what keeps a stale cookie from
// being checked on an unknown URL (PR #997: the 404 stays genuine).

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
	capturedSignals: [] as AbortSignal[],
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
	createClient: ({ signal }: { signal?: AbortSignal }) => {
		if (signal) {
			mocks.capturedSignals.push(signal);
		}
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

const flushMicrotasks = async () => {
	for (let i = 0; i < 10; i += 1) {
		await Promise.resolve();
	}
};

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { RoutedShell } from './__root';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.capturedSignals = [];
	mocks.isHydrated = true;
	mocks.matches = [];
	mocks.tokens = { staffToken: 'staff-tok' };
});

describe('surface-redirect-code query on route-exactness loss', () => {
	test('keeps the in-flight validation alive and never starts a second one on the unknown path', async () => {
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
			expect(mocks.capturedSignals.length).toBeGreaterThan(0);
		});
		expect(mocks.capturedSignals[0]?.aborted).toBe(false);

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

		await flushMicrotasks();
		// Not aborted: the same-surface result is what the in-shell 404 reads.
		expect(mocks.capturedSignals[0]?.aborted).toBe(false);
		// And no second validation request: an unknown path never validates a
		// cookie by itself (PR #997).
		expect(mocks.capturedSignals).toHaveLength(1);
	});
});
