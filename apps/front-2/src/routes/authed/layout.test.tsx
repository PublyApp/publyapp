/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	queryOptions: undefined as
		| {
				queryFn: () => Promise<string | null>;
				staleTime?: number;
				refetchOnWindowFocus?: boolean;
				retry?: boolean;
		  }
		| undefined,
	queryResult: {
		data: undefined as string | null | undefined,
		error: undefined as unknown,
		isError: false,
		isLoading: false,
		refetch: vi.fn(),
	},
	tokens: { staffToken: undefined as string | undefined },
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	redirect: (opts: unknown) => opts,
	useLocation: () => ({ pathname: '/staff/tenants', search: {} }),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
	Outlet: () => <div data-testid="outlet-stub" />,
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: (options: typeof mocks.queryOptions) => {
		mocks.queryOptions = options;
		return mocks.queryResult;
	},
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getSessionTokensFromBrowser: () => mocks.tokens,
	createClient: () => ({
		auth: { redirectCode: { get: vi.fn() } },
	}),
}));

vi.mock('../../layouts/authed-layout', () => ({
	AuthedLayout: ({ children }: { children: ReactNode }) => (
		<div data-testid="authed-layout-stub">{children}</div>
	),
}));

vi.mock('~/components/error-views/AppErrorView', () => ({
	AppErrorView: () => <div data-testid="app-error-view-stub" />,
}));
vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect-stub" />,
}));
vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="view-403-stub" />,
}));
vi.mock('~/components/error-views/View404', () => ({
	View404: () => <div data-testid="view-404-stub" />,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './layout';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.queryOptions = undefined;
	mocks.tokens = { staffToken: undefined };
});

const AuthedRouteLayout = (Route as unknown as { component: ComponentType })
	.component;

describe('AuthedRouteLayout surface-redirect-code query', () => {
	test('is configured session-stable: never refetches on tab focus', () => {
		render(<AuthedRouteLayout />);

		expect(mocks.queryOptions).toBeDefined();
		expect(mocks.queryOptions?.staleTime).toBe(Infinity);
		expect(mocks.queryOptions?.refetchOnWindowFocus).toBe(false);
		expect(mocks.queryOptions?.retry).toBe(false);
	});

	test('queryFn resolves to null (never undefined) when no session token is present', async () => {
		mocks.tokens = { staffToken: undefined };
		render(<AuthedRouteLayout />);

		const result = await mocks.queryOptions?.queryFn();

		// TanStack Query v5 rejects a queryFn that resolves to `undefined`
		// ("Query data cannot be undefined") — null is the only valid
		// no-token-yet result.
		expect(result).toBeNull();
		expect(result).not.toBeUndefined();
	});
});

describe('AuthedRouteLayout render gating', () => {
	test('renders the outlet through the authed shell once the query has settled', () => {
		mocks.queryResult = {
			data: 'staff',
			error: undefined,
			isError: false,
			isLoading: false,
			refetch: vi.fn(),
		};
		render(<AuthedRouteLayout />);

		expect(screen.getByTestId('outlet-stub')).toBeTruthy();
	});
});
