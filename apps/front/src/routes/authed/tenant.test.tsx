/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TenantsForPickerData } from '~/lib/query/tenants-for-picker';
import { SELECTED_TENANT_STORAGE_KEY } from '~/lib/selected-tenant-storage';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	query: {
		isPending: false,
		isLoading: false,
		isError: false,
		isSuccess: true,
		error: undefined as unknown,
		data: undefined as TenantsForPickerData | undefined,
		refetch: vi.fn(),
	},
	logout: vi.fn(),
	isLoggingOut: false,
	shouldLogoutForFailure: vi.fn(() => false),
	navigate: vi.fn(),
	pathname: '/tenant',
	// Committed-location override for the mid-flight-navigation regression
	// test; undefined falls back to `pathname` (no navigation pending).
	resolvedPathname: undefined as string | undefined,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	createRootRouteWithContext: () => () => ({}),
	Link: ({
		to,
		children,
		...props
	}: {
		to: string;
		children: ReactNode;
		[key: string]: unknown;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	Outlet: () => <div data-testid="outlet-stub">outlet</div>,
	useMatches: ({ select }: { select?: (matches: unknown[]) => void }) =>
		select?.([
			{
				routeId: '/_authed-layout',
				pathname: '/',
				params: {},
				staticData: { crumbs: 'shell' },
			},
			{
				routeId: '/_authed-layout/tenant',
				pathname: '/tenant',
				params: {},
				staticData: { crumbs: 'shell' },
			},
			{
				routeId: '/_authed-layout/tenant/account',
				pathname: mocks.pathname,
				params: {},
				staticData: { crumbs: 'shell' },
			},
		]),
	useRouterState: ({ select }: { select?: (state: unknown) => void }) =>
		select?.({
			location: { pathname: mocks.pathname },
			resolvedLocation: {
				pathname: mocks.resolvedPathname ?? mocks.pathname,
			},
		}),
	useQueryClient: () => ({}),
	useNavigate: () => mocks.navigate,
	// The portal's redirects are declarative `<Navigate>` elements now; the
	// stub funnels them through the same `mocks.navigate` spy the assertions
	// already inspect.
	Navigate: ({ to, replace }: { to: string; replace?: boolean }) => {
		mocks.navigate({ to, replace });
		return null;
	},
}));

// RoutedShell (the shell decision in `../__root`) needs a resolved surface
// session query to consider a session validated — only reached when the path
// is a tenant path, where the tenant branch renders before it is consulted.
vi.mock('@tanstack/react-query', () => ({
	useQuery: () => ({
		data: 'tenant' as string | null,
		error: undefined,
		status: 'success' as const,
	}),
	useQueryClient: () => ({}),
}));

// usePreloadIntentQueries is mounted in AuthedWorkspaceShell (#2007); this suite
// has no QueryClient. The hook's own behaviour is tested in preload-intent.test.tsx.
vi.mock('~/lib/query/preload-intent', () => ({
	usePreloadIntentQueries: () => undefined,
}));

vi.mock('~/lib/hooks/use-hydrated', () => ({
	useHydrated: () => true,
}));

vi.mock('~/layouts/simple-layout', () => ({
	SimpleLayout: ({ children }: { children: ReactNode }) => (
		<div data-testid="simple-layout-stub">{children}</div>
	),
}));

vi.mock('~/lib/query/tenants-for-picker', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/query/tenants-for-picker')
	>('~/lib/query/tenants-for-picker');

	return {
		...actual,
		useTenantsForPickerQuery: () => mocks.query,
	};
});

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({
		logout: mocks.logout,
		isLoggingOut: mocks.isLoggingOut,
	}),
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

// The child-path tests mount under the real RoutedShell, which wraps them in
// the real AppShell — keep its user menu out of scope here (shell-continuity
// tests own the chrome assertions).
vi.mock('~/components/app-shell/user-menu', () => ({
	AppShellUserMenu: () => <div data-testid="user-menu-stub" />,
}));

const EN_LABELS: TestLabelMap = {
	'select-organization': 'Select Organization',
	'select-organization-description':
		'Choose which organization you want to access',
	'failed-to-load-organizations': 'Failed to load organizations',
	'no-organizations-found': 'No organizations found',
	'all-organizations-deleted-title':
		'Your organizations are no longer available',
	'all-organizations-deleted-description':
		'All of your organizations have been removed by their administrators. If you believe this is a mistake, contact support.',
	'suspended-tenants-banner':
		'Some of your organizations have been suspended and are temporarily unavailable. Please contact support for assistance.',
	'contact-support': 'Contact Support',
	suspended: 'Suspended',
	'log-out': 'Log out',
	'common-loading': 'Loading...',
	'unnamed-tenant': 'Unnamed tenant',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

const activeTenant = (
	id: string,
	name: string,
): TenantsForPickerData['tenants'][number] => ({
	id,
	name,
	code: `${id}-code`,
	status: 'Active',
});

const suspendedTenant = (
	id: string,
	name: string,
): TenantsForPickerData['tenants'][number] => ({
	id,
	name,
	code: `${id}-code`,
	status: 'Suspended',
});

const setQuery = (overrides: Partial<typeof mocks.query>) => {
	Object.assign(mocks.query, {
		isPending: false,
		isLoading: false,
		isError: false,
		isSuccess: true,
		error: undefined,
		data: undefined,
		...overrides,
	});
};

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { RoutedShell } from '../__root';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './tenant';

const TenantPortalRoute = Route.options.component as ComponentType;

const resolveSingleActiveTenant = () => {
	setQuery({
		data: {
			tenants: [activeTenant('t-1', 'Acme')],
			activeCount: 1,
			totalCount: 1,
			hasDeletedTenants: false,
			hasSuspendedTenants: false,
		},
	});
};

const setTwoActiveTenants = () => {
	setQuery({
		data: {
			tenants: [activeTenant('t-1', 'Acme'), activeTenant('t-2', 'TechStart')],
			activeCount: 2,
			totalCount: 2,
			hasDeletedTenants: false,
			hasSuspendedTenants: false,
		},
	});
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	// clearAllMocks keeps implementations, so restore the default verdict of
	// the fatal-failure predicate explicitly — the 401 escape test flips it.
	mocks.shouldLogoutForFailure.mockReturnValue(false);
	window.localStorage.clear();
	mocks.pathname = '/tenant';
	mocks.resolvedPathname = undefined;
});

describe('TenantPortalRoute', () => {
	test('renders the loading state while the query is pending', () => {
		setQuery({ isSuccess: false, isPending: true, isLoading: true });
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-loading')).toBeTruthy();
	});

	test('renders the error state with a retry action that refetches', () => {
		setQuery({ isSuccess: false, isError: true, error: new Error('boom') });
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-error')).toBeTruthy();
		expect(screen.getByText('Failed to load organizations')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'retry' }));
		expect(mocks.query.refetch).toHaveBeenCalledTimes(1);
	});

	test('renders a log-out escape from the error state', () => {
		setQuery({ isSuccess: false, isError: true, error: new Error('boom') });
		render(<TenantPortalRoute />);

		fireEvent.click(screen.getByTestId('tenant-portal-error-logout-button'));
		expect(mocks.logout).toHaveBeenCalledTimes(1);
	});

	test('logs out instead of rendering the error state on a 401', () => {
		setQuery({ isSuccess: false, isError: true, error: new Error('boom') });
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		render(<TenantPortalRoute />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		expect(screen.queryByTestId('tenant-portal-error')).toBeNull();
	});

	test('renders the empty state when there are no tenants at all', () => {
		setQuery({
			data: {
				tenants: [],
				activeCount: 0,
				totalCount: 0,
				hasDeletedTenants: false,
				hasSuspendedTenants: false,
			},
		});
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-empty')).toBeTruthy();
		expect(screen.getByText('No organizations found')).toBeTruthy();
	});

	test('#258: renders the deletion notice when every tenant was soft-deleted', () => {
		// Different angle from `_tenant-picker-states.test.tsx`: that file
		// drives the presentational component directly, this one drives the
		// full route and pins that the `hasDeletedTenants` query field is what
		// the wire payload carries through to the empty state.
		setQuery({
			data: {
				tenants: [],
				activeCount: 0,
				totalCount: 0,
				hasDeletedTenants: true,
				hasSuspendedTenants: false,
			},
		});
		render(<TenantPortalRoute />);

		// Same surface as the generic empty state — the MESSAGE is what tells
		// the orphaned user apart from one who was never invited anywhere.
		expect(screen.getByTestId('tenant-portal-empty')).toBeTruthy();
		expect(
			screen.getByText('Your organizations are no longer available'),
		).toBeTruthy();
		expect(
			screen.getByText(
				/All of your organizations have been removed by their administrators/,
			),
		).toBeTruthy();
		expect(screen.queryByText('No organizations found')).toBeNull();

		// The deleted case carries the portal's real exit action.
		expect(screen.getByTestId('tenant-portal-logout-button')).toBeTruthy();

		// Clicking that button is the portal's real exit affordance — it
		// logs the user out rather than retrying a doomed resolve.
		fireEvent.click(screen.getByTestId('tenant-portal-logout-button'));
		expect(mocks.logout).toHaveBeenCalledTimes(1);
	});

	test('the workspace root redirects to the first section once a workspace resolves', () => {
		resolveSingleActiveTenant();
		render(<TenantPortalRoute />);

		expect(screen.getByTestId('tenant-portal-redirecting')).toBeTruthy();
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/tenant/account',
			replace: true,
		});
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
	});

	test('still auto-resolves with one active tenant even when a sibling tenant is suspended', () => {
		setQuery({
			data: {
				tenants: [
					activeTenant('t-1', 'Acme'),
					suspendedTenant('t-2', 'Global'),
				],
				activeCount: 1,
				totalCount: 2,
				hasDeletedTenants: false,
				hasSuspendedTenants: true,
			},
		});
		mocks.pathname = '/tenant/account';
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-workspace-shell')).toBeTruthy();
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
	});

	test('a child route resolves straight to the workspace shell without redirecting', () => {
		resolveSingleActiveTenant();
		mocks.pathname = '/tenant/account';
		render(<TenantPortalRoute />);

		expect(screen.getByTestId('tenant-workspace-shell')).toBeTruthy();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
	});

	test('the workspace shell shows the resolved tenant identity and no duplicate chrome', () => {
		resolveSingleActiveTenant();
		mocks.pathname = '/tenant/account';
		render(<TenantPortalRoute />);

		expect(screen.getByTestId('tenant-workspace-tenant-name').textContent).toBe(
			'Acme',
		);
		expect(screen.getByTestId('tenant-workspace-tenant-code').textContent).toBe(
			't-1-code',
		);
		// The AppShell owns the chrome (rail, topbar, user-menu logout) — the
		// shell must not duplicate any of it.
		expect(screen.queryByTestId('tenant-workspace-logout-button')).toBeNull();
		expect(screen.queryByTestId('tenant-workspace-nav')).toBeNull();
	});

	test('the workspace shell fits the AppShell content model: no main landmark, no forced viewport height', () => {
		resolveSingleActiveTenant();
		mocks.pathname = '/tenant/account';
		const { container } = render(<TenantPortalRoute />);

		expect(container.querySelectorAll('main')).toHaveLength(0);
		expect(
			screen.getByTestId('tenant-workspace-shell').className,
		).not.toContain('min-h-svh');
	});

	test('a deep link to a child route resolves through the persisted tenant selection', () => {
		window.localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, 't-1');
		mocks.pathname = '/tenant/account';
		setTwoActiveTenants();
		render(<TenantPortalRoute />);

		expect(screen.getByTestId('tenant-workspace-shell')).toBeTruthy();
		expect(screen.getByTestId('tenant-workspace-tenant-name').textContent).toBe(
			'Acme',
		);
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
	});

	test('a stored tenant that no longer resolves redirects a child deep link to the picker root', () => {
		window.localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, 't-9');
		mocks.pathname = '/tenant/account';
		setTwoActiveTenants();
		render(<TenantPortalRoute />);

		// The child path never renders the picker itself: it redirects to
		// `/tenant`, where the bare picker is the single unresolved surface.
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/tenant',
			replace: true,
		});
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
		expect(screen.queryByTestId('tenant-workspace-shell')).toBeNull();
	});

	test('shows the picker list with 2+ active tenants, no suspended banner when none are suspended', () => {
		setTwoActiveTenants();
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-picker')).toBeTruthy();
		expect(screen.getAllByTestId('tenant-portal-row')).toHaveLength(2);
		expect(screen.queryByTestId('tenant-portal-suspended-banner')).toBeNull();
	});

	test('shows the suspended banner and disables suspended rows when a suspended tenant is present', () => {
		setQuery({
			data: {
				tenants: [
					activeTenant('t-1', 'Acme'),
					activeTenant('t-2', 'TechStart'),
					suspendedTenant('t-3', 'Global'),
				],
				activeCount: 2,
				totalCount: 3,
				hasDeletedTenants: false,
				hasSuspendedTenants: true,
			},
		});
		render(<TenantPortalRoute />);
		expect(screen.getByTestId('tenant-portal-suspended-banner')).toBeTruthy();

		const rows = screen.getAllByTestId('tenant-portal-row');
		expect(rows).toHaveLength(3);

		const suspendedRow = rows.find(
			(row) => row.getAttribute('data-tenant-id') === 't-3',
		);
		expect(suspendedRow?.tagName).toBe('DIV');
		expect(suspendedRow?.querySelector('button')).toBeNull();

		const activeRow = rows.find(
			(row) => row.getAttribute('data-tenant-id') === 't-1',
		);
		expect(activeRow?.tagName).toBe('BUTTON');
	});

	test('selecting an active tenant persists the choice and resolves the workspace', () => {
		setTwoActiveTenants();
		render(<TenantPortalRoute />);

		const rows = screen.getAllByTestId('tenant-portal-row');
		fireEvent.click(rows[0]);

		expect(window.localStorage.getItem(SELECTED_TENANT_STORAGE_KEY)).toBe(
			't-1',
		);
		expect(screen.getByTestId('tenant-portal-redirecting')).toBeTruthy();
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/tenant/account',
			replace: true,
		});
	});

	test('wires the log-out button to useLogout', () => {
		setTwoActiveTenants();
		render(<TenantPortalRoute />);

		fireEvent.click(screen.getByTestId('tenant-portal-logout-button'));
		expect(mocks.logout).toHaveBeenCalledTimes(1);
	});

	test('regression: an unresolved child path never nests the picker in the AppShell — it redirects to `/tenant` (PR #1131 round 3 finding 1)', () => {
		// Cold load of `/tenant/account`: the tenants query is still pending,
		// so the route shows a neutral redirect spinner — never the
		// SimpleLayout picker, which must not sit inside the AppShell that
		// wraps child paths (round 4 restores the AppShell for children and
		// moves the unresolved surface to the bare `/tenant` root).
		setQuery({ isSuccess: false, isPending: true, isLoading: true });
		mocks.pathname = '/tenant/account';

		const view = render(
			<RoutedShell>
				<TenantPortalRoute />
			</RoutedShell>,
		);

		expect(screen.getByTestId('tenant-portal-redirecting')).toBeTruthy();
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
		expect(screen.queryByTestId('simple-layout-stub')).toBeNull();
		// The child path mounts inside the AppShell (round 4) — the chrome is
		// present, but the unresolved branch inside it is a neutral spinner,
		// never the SimpleLayout picker.
		expect(screen.getByTestId('app-shell-shell')).toBeTruthy();
		expect(mocks.navigate).not.toHaveBeenCalled();

		// Once the query settles with no resolvable workspace (2+ actives,
		// no valid stored selection), the child path redirects to `/tenant` —
		// the bare picker becomes the single unresolved surface.
		setQuery({
			data: {
				tenants: [
					activeTenant('t-1', 'Acme'),
					activeTenant('t-2', 'TechStart'),
				],
				activeCount: 2,
				totalCount: 2,
				hasDeletedTenants: false,
				hasSuspendedTenants: false,
			},
		});
		view.rerender(
			<RoutedShell>
				<TenantPortalRoute />
			</RoutedShell>,
		);

		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/tenant',
			replace: true,
		});
		expect(screen.queryByTestId('tenant-portal-picker')).toBeNull();
		expect(screen.queryByTestId('tenant-workspace-shell')).toBeNull();
		expect(screen.queryByTestId('simple-layout-stub')).toBeNull();
	});

	test('regression: an in-flight navigation never re-branches the mounted portal (logout-to-login race from bot PR #1236\u2019s router bump)', () => {
		// During logout the router exposes the TARGET path (`/login`) through
		// `state.location` before the navigation commits, while this portal is
		// still mounted. Branching on that in-flight path flipped the portal
		// into the unresolved-child branch mid-flight and mounted a fresh
		// `<Navigate to="/tenant">` that CANCELLED the in-flight login
		// navigation (lazy auth chunk aborted, status -1): the navigate promise
		// never settled, `queryClient.clear()` never ran, and the picker froze
		// with a permanently disabled Log out button — exactly the
		// front-e2e "logging out from the picker returns to login" failure.
		// Branch decisions must read the COMMITTED location instead.
		setTwoActiveTenants();
		mocks.resolvedPathname = '/tenant';
		mocks.pathname = '/login';

		render(<TenantPortalRoute />);

		// Still the bare picker root, and critically NO redirect element was
		// mounted — nothing may compete with the in-flight navigation.
		expect(screen.getByTestId('tenant-portal-picker')).toBeTruthy();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
