/**
 * @vitest-environment jsdom
 *
 * #1059 — restate the "refocus issues no redirect-code refetch" e2e assertion
 * as a structural invariant at the seam.
 *
 * The e2e spec `tab-refocus-stability.spec.ts` observes the live network over a
 * bounded window and passes when no `/auth/redirect-code` request lands — that
 * proves "not yet", not "never". The real reason refocus is silent is the query
 * config in `RoutedShell`: `refetchOnWindowFocus: false` (plus `staleTime:
 * Infinity`), asserted here directly on the `useQuery` options the shell hands
 * to TanStack Query. No running stack required; this is the seam the e2e was
 * only approximating.
 *
 * Proof is paired: flip `refetchOnWindowFocus` to `true` in `__root.tsx` and
 * this test goes RED; restore `false` and it goes GREEN.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ParsedSessionTokens } from '@org/shared-ts/lib/session/parse';

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

const mocks = vi.hoisted(() => ({
	capturedOptions: undefined as
		| {
				refetchOnWindowFocus?: boolean | 'always' | undefined;
				staleTime?: number | undefined;
				retry?: boolean | number | undefined;
		  }
		| undefined,
	isHydrated: true,
	matches: [] as MockMatch[],
	tokens: { staffToken: 'staff-tok' } satisfies ParsedSessionTokens,
}));

// Capture the options the shell passes to TanStack Query for the
// surface-redirect-code query — this is the structural seam.
vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>();
	return {
		...actual,
		useQuery: (options: NonNullable<typeof mocks.capturedOptions>) => {
			mocks.capturedOptions = options;
			return {
				data: 'staff',
				status: 'success',
				isLoading: false,
				isError: false,
				error: undefined,
				refetch: vi.fn(),
			};
		},
	};
});

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
	vi.clearAllMocks();
	mocks.capturedOptions = undefined;
	mocks.isHydrated = true;
	mocks.matches = [];
	mocks.tokens = { staffToken: 'staff-tok' };
});

describe('surface-redirect-code query refocus invariant (BUG-1, #1059)', () => {
	test('the shell configures the redirect-code query so a tab refocus never refetches it', async () => {
		mocks.matches = exactStaffMatches;
		const queryClient = new QueryClient();

		render(
			<QueryClientProvider client={queryClient}>
				<RoutedShell>
					<div />
				</RoutedShell>
			</QueryClientProvider>,
		);

		// The shell only mounts one `useQuery` (the surface-redirect-code
		// query). Its options are the seam the e2e spec was observing indirectly.
		expect(mocks.capturedOptions).toBeDefined();

		// A refocus must NOT re-trigger this query — structural, not observed.
		expect(mocks.capturedOptions?.refetchOnWindowFocus).toBe(false);

		// Session-stable: the surface a token belongs to only changes on
		// login/logout, so the entry is fresh forever and never goes stale on
		// refocus either.
		expect(mocks.capturedOptions?.staleTime).toBe(Infinity);

		// A transient 5xx must not blank a settled route via retry churn.
		expect(mocks.capturedOptions?.retry).toBe(false);
	});
});
