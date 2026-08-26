/**
 * @vitest-environment jsdom
 */
import type { UseQueryResult } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SessionSurfaceValidationProvider } from '~/lib/session-surface-recovery-context';

import type { ParsedSessionTokens } from '@org/shared-ts/lib/session/parse';

function createQueryResult(overrides: {
	data: string | null | undefined;
	isLoading?: boolean;
	isError?: boolean;
	error?: unknown;
	refetch?: () => void;
}): UseQueryResult<string | null, unknown> {
	return {
		error: overrides.error,
		isError: overrides.isError,
		isLoading: overrides.isLoading,
		refetch: overrides.refetch,
		data: overrides.data,
	} as UseQueryResult<string | null, unknown>;
}

const mocks = vi.hoisted(() => ({
	queryResult: createQueryResult({
		data: undefined,
		error: undefined,
		isError: false,
		isLoading: false,
		refetch: vi.fn(),
	}),
	tokens: {} as ParsedSessionTokens,
	location: {
		pathname: '/staff/tenants',
		search: {},
	},
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	redirect: (opts: unknown) => opts,
	useLocation: () => mocks.location,
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
	Outlet: () => <div data-testid="outlet-stub" />,
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getSessionTokensFromBrowser: () => mocks.tokens,
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
	mocks.tokens = {};
	mocks.location = { pathname: '/staff/tenants', search: {} };
});

type MockMatch = {
	_notFound?: boolean;
	pathname?: string;
	routeId?: string;
};

// `Route.options` types its members against the real route tree, so
// `component`/`pendingComponent`/`beforeLoad` resolve through generics the
// test can't name. The helper is the single widening point.
function widenOptions<T>(value: unknown): T {
	return value as T;
}
const routeOptions = widenOptions<{
	component: ComponentType;
	pendingComponent: ComponentType;
	beforeLoad: (args: {
		location: { pathname: string };
		matches: MockMatch[];
	}) => Promise<void>;
}>(Route);

// An exact match: the deepest match is a real leaf route registered under
// `/_authed-layout` whose pathname is the requested one.
const exactMatches = (pathname: string): MockMatch[] => [
	{ routeId: '__root__', pathname: '/' },
	{ routeId: '/_authed-layout', pathname: '/' },
	{ routeId: `/_authed-layout${pathname}`, pathname },
];

// An unknown path under the authed prefix: no leaf route matched, so the
// deepest match is the pathless layout itself (see route-shell.test.ts).
const unknownPathMatches: MockMatch[] = [
	{ routeId: '__root__', pathname: '/' },
	{ routeId: '/_authed-layout', pathname: '/' },
];
const AuthedRouteLayout = routeOptions.component;
const AuthedRoutePendingSkeleton = routeOptions.pendingComponent;

const renderLayout = () =>
	render(
		<SessionSurfaceValidationProvider value={mocks.queryResult}>
			<AuthedRouteLayout />
		</SessionSurfaceValidationProvider>,
	);

describe('beforeLoad session-token guard', () => {
	test('redirects a tenant-only session away from a /staff path to /tenant', async () => {
		mocks.tokens = { tenantToken: 'tenant-tok' };

		await expect(
			routeOptions.beforeLoad({
				location: { pathname: '/staff/profiles' },
				matches: exactMatches('/staff/profiles'),
			}),
		).rejects.toEqual({ to: '/tenant' });
	});

	test('redirects a staff-only session away from a /tenant path to /staff', async () => {
		mocks.tokens = { staffToken: 'staff-tok' };

		await expect(
			routeOptions.beforeLoad({
				location: { pathname: '/tenant' },
				matches: exactMatches('/tenant'),
			}),
		).rejects.toEqual({ to: '/staff' });
	});

	test('redirects a tokenless visitor to /login carrying rto but no forged rc', async () => {
		mocks.tokens = {};

		const rejection = await routeOptions
			.beforeLoad({
				location: { pathname: '/staff/profiles' },
				matches: exactMatches('/staff/profiles'),
			})
			.catch((error: unknown) => error);

		expect(rejection).toMatchObject({
			to: '/login',
			search: { rto: '/staff/profiles' },
		});
		expect(
			(rejection as { search?: Record<string, unknown> }).search,
		).not.toHaveProperty('rc');
	});

	test('does not redirect when the session token matches the surface', async () => {
		mocks.tokens = { staffToken: 'staff-tok' };

		await expect(
			routeOptions.beforeLoad({
				location: { pathname: '/staff/profiles' },
				matches: exactMatches('/staff/profiles'),
			}),
		).resolves.toBeUndefined();
	});
});

describe('beforeLoad exact-match guard (PR #997 finding 1)', () => {
	test('does not redirect a signed-out visitor on an unknown authed-prefix path', async () => {
		mocks.tokens = {};

		await expect(
			routeOptions.beforeLoad({
				location: { pathname: '/staff/not-a-route' },
				matches: unknownPathMatches,
			}),
		).resolves.toBeUndefined();
	});

	test('does not redirect a cross-scope cookie holder on an unknown authed-prefix path', async () => {
		mocks.tokens = { tenantToken: 'tenant-tok' };

		await expect(
			routeOptions.beforeLoad({
				location: { pathname: '/staff/not-a-route' },
				matches: unknownPathMatches,
			}),
		).resolves.toBeUndefined();
	});

	test('still redirects a tokenless visitor when the same path is an exact authed match', async () => {
		mocks.tokens = {};

		await expect(
			routeOptions.beforeLoad({
				location: { pathname: '/staff/profiles' },
				matches: exactMatches('/staff/profiles'),
			}),
		).rejects.toMatchObject({ to: '/login' });
	});
});

describe('AuthedRouteLayout surface-redirect-code query', () => {
	test('renders loading shell when the shared validation query is loading', () => {
		mocks.queryResult = createQueryResult({
			data: undefined,
			error: undefined,
			isError: false,
			isLoading: true,
			refetch: vi.fn(),
		});
		renderLayout();

		expect(screen.getByTestId('authed-route-content-skeleton')).toBeTruthy();
		expect(screen.queryByText('loading')).toBeNull();
	});
});

describe('AuthedRouteLayout render gating', () => {
	test('swaps only route content while the surface query settles', () => {
		mocks.queryResult = createQueryResult({
			data: undefined,
			error: undefined,
			isError: false,
			isLoading: true,
			refetch: vi.fn(),
		});
		const { rerender } = renderLayout();

		expect(screen.getByTestId('authed-route-content-skeleton')).toBeTruthy();
		expect(screen.queryByText('loading')).toBeNull();

		mocks.queryResult = createQueryResult({
			data: 'staff',
			error: undefined,
			isError: false,
			isLoading: false,
			refetch: vi.fn(),
		});
		rerender(
			<SessionSurfaceValidationProvider value={mocks.queryResult}>
				<AuthedRouteLayout />
			</SessionSurfaceValidationProvider>,
		);

		expect(screen.getByTestId('outlet-stub')).toBeTruthy();
	});

	test('renders the outlet once the query has settled', () => {
		mocks.queryResult = createQueryResult({
			data: 'staff',
			error: undefined,
			isError: false,
			isLoading: false,
			refetch: vi.fn(),
		});
		renderLayout();

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

	test('renders a store-free content skeleton for a staff path', () => {
		mocks.location = { pathname: '/staff/tenants', search: {} };
		render(<AuthedRoutePendingSkeleton />);

		expect(screen.getByTestId('authed-route-content-skeleton')).toBeTruthy();
		// The route fallback owns content only. RoutedShell owns the one real
		// AppShell instance across pending and settled matches.
		expect(screen.queryByTestId('app-shell-rail')).toBeNull();
	});

	test('renders the tenant-portal spinner for the root, the content skeleton for child paths', () => {
		mocks.location = { pathname: '/tenant', search: {} };
		const view = render(<AuthedRoutePendingSkeleton />);

		expect(screen.queryByTestId('authed-route-content-skeleton')).toBeNull();

		// A tenant CHILD path mounts inside the AppShell (round 4), so its
		// pending surface is the normal AppShell-shaped content skeleton —
		// only the exact `/tenant` root keeps the bare spinner.
		mocks.location = { pathname: '/tenant/account', search: {} };
		view.rerender(<AuthedRoutePendingSkeleton />);

		expect(screen.getByTestId('authed-route-content-skeleton')).toBeTruthy();
	});
});
