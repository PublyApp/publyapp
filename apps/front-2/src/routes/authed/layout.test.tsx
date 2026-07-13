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
	location: {
		pathname: '/staff/tenants',
		search: {} as Record<string, unknown>,
	},
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	redirect: (opts: unknown) => opts,
	useLocation: () => mocks.location,
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
	mocks.location = { pathname: '/staff/tenants', search: {} };
});

const routeOptions = Route as unknown as {
	component: ComponentType;
	pendingComponent: ComponentType;
	beforeLoad: (args: { location: { pathname: string } }) => Promise<void>;
};
const AuthedRouteLayout = routeOptions.component;
const AuthedRoutePendingSkeleton = routeOptions.pendingComponent;

describe('beforeLoad session-token guard', () => {
	test('redirects a tenant-only session away from a /staff path to /tenant', async () => {
		mocks.tokens = { tenantToken: 'tenant-tok' } as typeof mocks.tokens;

		await expect(
			routeOptions.beforeLoad({ location: { pathname: '/staff/profiles' } }),
		).rejects.toEqual({ to: '/tenant' });
	});

	test('redirects a staff-only session away from a /tenant path to /staff', async () => {
		mocks.tokens = { staffToken: 'staff-tok' } as typeof mocks.tokens;

		await expect(
			routeOptions.beforeLoad({ location: { pathname: '/tenant' } }),
		).rejects.toEqual({ to: '/staff' });
	});

	test('redirects a tokenless visitor to /login with the session-expired search', async () => {
		mocks.tokens = {} as typeof mocks.tokens;

		await expect(
			routeOptions.beforeLoad({ location: { pathname: '/staff/profiles' } }),
		).rejects.toMatchObject({
			to: '/login',
			search: { rc: 'invalid_session' },
		});
	});

	test('does not redirect when the session token matches the surface', async () => {
		mocks.tokens = { staffToken: 'staff-tok' } as typeof mocks.tokens;

		await expect(
			routeOptions.beforeLoad({ location: { pathname: '/staff/profiles' } }),
		).resolves.toBeUndefined();
	});
});

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

describe('BUG-2: pendingComponent closes the cold-boot blank window', () => {
	// TanStack Start uses `route.options.pendingComponent` as both the SSR
	// fallback and the pre-hydration `ClientOnly` fallback for `ssr: false`
	// routes (see @tanstack/react-router's Match.js). A route with no
	// pendingComponent renders `null` there — a blank <body> for the whole
	// network+hydrate round trip on a cold boot (tab discard, hard reload).
	test('the route is configured with a pendingComponent (never falls back to null)', () => {
		expect(routeOptions.pendingComponent).toBeDefined();
		expect(typeof routeOptions.pendingComponent).toBe('function');
	});

	test('renders static app shell chrome (rail + topbar) for a staff path', () => {
		mocks.location = { pathname: '/staff/tenants', search: {} };
		render(<AuthedRoutePendingSkeleton />);

		expect(screen.getByTestId('app-shell-pending-rail')).toBeTruthy();
		expect(screen.getByTestId('app-shell-pending-topbar')).toBeTruthy();
		// No AuthedLayout/AppShell stub here on purpose — this must stay a
		// store-free static skeleton (see the comment on
		// AuthedRoutePendingSkeleton for why reusing the stateful shell
		// regressed the secondary-panel persisted preference), and it uses
		// its own testids distinct from the real shell's (see the comment on
		// AuthedRoutePendingSkeleton for why sharing them broke existing
		// strict-mode getByTestId assertions during internal redirects).
		expect(screen.queryByTestId('authed-layout-stub')).toBeNull();
		expect(screen.queryByTestId('app-shell-rail')).toBeNull();
	});

	test('renders the tenant-portal spinner (not the workspace shell) for the tenant root', () => {
		mocks.location = { pathname: '/tenant', search: {} };
		render(<AuthedRoutePendingSkeleton />);

		expect(screen.queryByTestId('app-shell-pending-rail')).toBeNull();
	});
});
