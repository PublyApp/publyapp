/**
 * @vitest-environment jsdom
 */
import type { UseQueryResult } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	SessionSurfaceRecoveryProvider,
	SessionSurfaceValidationProvider,
} from '~/lib/session-surface-recovery-context';

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
	} as unknown as UseQueryResult<string | null, unknown>;
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

const routeOptions = Route as unknown as {
	component: ComponentType;
	pendingComponent: ComponentType;
	beforeLoad: (args: { location: { pathname: string } }) => Promise<void>;
};
const AuthedRouteLayout = routeOptions.component;
const AuthedRoutePendingSkeleton = routeOptions.pendingComponent;

const renderLayout = () =>
	render(
		<SessionSurfaceRecoveryProvider value={true}>
			<SessionSurfaceValidationProvider value={mocks.queryResult}>
				<AuthedRouteLayout />
			</SessionSurfaceValidationProvider>
		</SessionSurfaceRecoveryProvider>,
	);

describe('beforeLoad session-token guard', () => {
	test('redirects a tenant-only session away from a /staff path to /tenant', async () => {
		mocks.tokens = { tenantToken: 'tenant-tok' };

		await expect(
			routeOptions.beforeLoad({ location: { pathname: '/staff/profiles' } }),
		).rejects.toEqual({ to: '/tenant' });
	});

	test('redirects a staff-only session away from a /tenant path to /staff', async () => {
		mocks.tokens = { staffToken: 'staff-tok' };

		await expect(
			routeOptions.beforeLoad({ location: { pathname: '/tenant' } }),
		).rejects.toEqual({ to: '/staff' });
	});

	test('redirects a tokenless visitor to /login carrying rto but no forged rc', async () => {
		mocks.tokens = {};

		const rejection = await routeOptions
			.beforeLoad({ location: { pathname: '/staff/profiles' } })
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
			routeOptions.beforeLoad({ location: { pathname: '/staff/profiles' } }),
		).resolves.toBeUndefined();
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
			<SessionSurfaceRecoveryProvider value={true}>
				<SessionSurfaceValidationProvider value={mocks.queryResult}>
					<AuthedRouteLayout />
				</SessionSurfaceValidationProvider>
			</SessionSurfaceRecoveryProvider>,
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

	test('renders the tenant-portal spinner (not the workspace shell) for the tenant root', () => {
		mocks.location = { pathname: '/tenant', search: {} };
		render(<AuthedRoutePendingSkeleton />);

		expect(screen.queryByTestId('authed-route-content-skeleton')).toBeNull();
	});
});
