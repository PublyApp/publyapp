/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	location: {
		pathname: '/staff',
		search: {},
		searchStr: '',
	},
	resolvedLocation: {
		pathname: '/staff',
		search: {},
		searchStr: '',
	},
	matchedPathname: '/staff',
	isHydrated: true,
	navigate: vi.fn(),
	outletPhase: 'loading' as 'loading' | 'settled',
	sessionQueryState: {
		data: 'staff' as string | null | undefined,
		error: undefined as unknown,
		status: 'success' as 'error' | 'pending' | 'success',
	},
}));

vi.mock('@tanstack/react-query', () => ({
	useQuery: () => mocks.sessionQueryState,
	useQueryClient: () => ({}),
}));
// usePreloadIntentQueries is mounted in AuthedWorkspaceShell (#2007); this suite
// has no QueryClient. The hook's own behaviour is tested in preload-intent.test.tsx.
vi.mock('~/lib/query/preload-intent', () => ({
	usePreloadIntentQueries: () => undefined,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('@tanstack/react-router')>();

	return {
		...actual,
		Link: ({ children, ...props }: React.ComponentProps<'a'>) => (
			<a {...props}>{children}</a>
		),
		Outlet: () =>
			mocks.outletPhase === 'loading' ? (
				<div data-testid="route-loading-content" />
			) : (
				<div data-testid="route-settled-content" />
			),
		useLocation: () => mocks.location,
		useNavigate: () => mocks.navigate,
		useMatches: ({ select }: { select: (matches: unknown[]) => void }) => {
			// `staticData`/`params` are only consumed by the app-shell's
			// breadcrumb trail derivation (`deriveBreadcrumbTrail`) — this
			// suite is about shell/outlet continuity, not breadcrumb content,
			// so `'shell'` (no tail) is the correct, harmless default here.
			let matches: unknown[];
			if (mocks.matchedPathname.startsWith('/staff')) {
				matches = [
					{
						routeId: '/_authed-layout',
						pathname: '/',
						params: {},
						staticData: { crumbs: 'shell' },
					},
					{
						routeId: '/_authed-layout/staff',
						pathname: mocks.matchedPathname,
						search: mocks.location.search,
						params: {},
						staticData: { crumbs: 'shell' },
					},
				];
			} else if (mocks.matchedPathname.startsWith('/tenant')) {
				matches = [
					{
						routeId: '/_authed-layout',
						pathname: '/',
						params: {},
						staticData: { crumbs: 'shell' },
					},
					{
						routeId: '/_authed-layout/tenant',
						pathname: '/tenant',
						search: mocks.location.search,
						params: {},
						staticData: { crumbs: 'shell' },
					},
					{
						routeId: '/_authed-layout/tenant/account',
						pathname: mocks.matchedPathname,
						search: mocks.location.search,
						params: {},
						staticData: { crumbs: 'shell' },
					},
				];
			} else {
				matches = [
					{
						routeId: mocks.matchedPathname,
						pathname: mocks.matchedPathname,
						search: mocks.location.search,
						params: {},
						staticData: { crumbs: 'shell' },
					},
				];
			}

			return select(matches);
		},
		useRouterState: ({ select }: { select: (state: unknown) => void }) =>
			select({
				location: mocks.location,
				resolvedLocation: mocks.resolvedLocation,
			}),
	};
});

vi.mock('react-i18next', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-i18next')>();

	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	};
});

vi.mock('~/lib/hooks/use-hydrated', () => ({
	useHydrated: () => mocks.isHydrated,
}));

vi.mock('~/components/app-shell/user-menu', () => ({
	AppShellUserMenu: () => <div data-testid="user-menu-stub" />,
}));

vi.mock('~/layouts/auth-layout', () => ({
	AuthLayout: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="auth-layout-stub">{children}</div>
	),
}));

vi.mock('~/layouts/marketing-layout', () => ({
	MarketingLayout: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="marketing-layout-stub">{children}</div>
	),
}));

import { RoutedShell } from '../__root';
import { Route as StaffIndexRoute } from './staff';

const RouteContent = () =>
	mocks.outletPhase === 'loading' ? (
		<div data-testid="route-loading-content" />
	) : (
		<div data-testid="route-settled-content" />
	);

afterEach(() => {
	cleanup();
	mocks.location = {
		pathname: '/staff',
		search: {},
		searchStr: '',
	};
	mocks.resolvedLocation = {
		pathname: '/staff',
		search: {},
		searchStr: '',
	};
	mocks.matchedPathname = '/staff';
	mocks.isHydrated = true;
	mocks.navigate.mockReset();
	mocks.outletPhase = 'loading';
	mocks.sessionQueryState = {
		data: 'staff',
		error: undefined,
		status: 'success',
	};
});

describe('authenticated shell continuity', () => {
	test('holds neutral shell geometry before hydration without identity or navigation', () => {
		mocks.location = {
			pathname: '/staff/profiles',
			search: {},
			searchStr: '',
		};
		mocks.resolvedLocation = mocks.location;
		mocks.matchedPathname = '/staff/profiles';
		mocks.isHydrated = false;

		render(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		const shell = screen.getByTestId('neutral-authed-shell');
		expect(shell.getAttribute('data-has-secondary-panel')).toBe('true');
		expect(shell.getAttribute('data-panel-open')).toBe('true');
		expect(screen.getByTestId('neutral-authed-shell-rail')).toBeTruthy();
		expect(screen.getByTestId('neutral-authed-shell-topbar')).toBeTruthy();
		expect(screen.getByTestId('route-loading-content')).toBeTruthy();
		expect(screen.queryByTestId('app-shell-shell')).toBeNull();
		expect(screen.queryByTestId('app-shell-rail')).toBeNull();
		expect(screen.queryByTestId('app-shell-topbar')).toBeNull();
		expect(screen.queryByTestId('user-menu-stub')).toBeNull();
		expect(shell.querySelector('a')).toBeNull();
		expect(shell.querySelector('nav')).toBeNull();
		expect(shell.textContent).toBe('');
	});

	test('keeps hydrated chrome neutral until session validation succeeds', () => {
		mocks.location = {
			pathname: '/staff/staff-users',
			search: {},
			searchStr: '',
		};
		mocks.resolvedLocation = mocks.location;
		mocks.matchedPathname = '/staff/staff-users';
		mocks.sessionQueryState = {
			data: undefined,
			error: undefined,
			status: 'pending',
		};

		const view = render(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		expect(screen.getByTestId('neutral-authed-shell')).toBeTruthy();
		expect(screen.queryByTestId('app-shell-shell')).toBeNull();

		mocks.sessionQueryState = {
			data: undefined,
			error: { responseStatusCode: 401, status: 401 },
			status: 'error',
		};
		view.rerender(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		expect(screen.getByTestId('neutral-authed-shell')).toBeTruthy();
		expect(screen.queryByTestId('app-shell-shell')).toBeNull();

		mocks.sessionQueryState = {
			data: 'staff',
			error: undefined,
			status: 'success',
		};
		view.rerender(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		expect(screen.getByTestId('app-shell-shell')).toBeTruthy();
		expect(screen.queryByTestId('neutral-authed-shell')).toBeNull();
	});

	test('exposes non-403 session recovery outside the inert shell and lets keyboard Retry run', async () => {
		mocks.location = {
			pathname: '/staff/staff-users',
			search: {},
			searchStr: '',
		};
		mocks.resolvedLocation = mocks.location;
		mocks.matchedPathname = '/staff/staff-users';
		mocks.sessionQueryState = {
			data: undefined,
			error: { responseStatusCode: 500, status: 500 },
			status: 'error',
		};
		const retry = vi.fn();
		const user = userEvent.setup();

		render(
			<RoutedShell>
				<button type="button" onClick={retry}>
					Retry
				</button>
			</RoutedShell>,
		);

		const retryButton = screen.getByRole('button', { name: 'Retry' });
		expect(screen.queryByTestId('neutral-authed-shell')).toBeNull();
		expect(screen.getByTestId('neutral-authed-recovery')).toBeTruthy();

		await user.tab();
		expect(document.activeElement).toBe(retryButton);
		await user.keyboard('{Enter}');
		expect(retry).toHaveBeenCalledTimes(1);
	});

	test('keeps the real app shell node while pending content settles and the staff index redirects', () => {
		const { rerender } = render(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);
		const shell = screen.getByTestId('app-shell-shell');

		expect(screen.getByTestId('route-loading-content')).toBeTruthy();

		mocks.location = {
			pathname: '/staff/staff-users',
			search: {},
			searchStr: '',
		};
		mocks.resolvedLocation = mocks.location;
		mocks.matchedPathname = '/staff/staff-users';
		mocks.outletPhase = 'settled';
		rerender(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		expect(screen.getByTestId('app-shell-shell')).toBe(shell);
		expect(shell.getAttribute('data-has-secondary-panel')).toBe('true');
		expect(shell.getAttribute('data-panel-open')).toBe('true');
		expect(screen.getByTestId('route-settled-content')).toBeTruthy();
	});

	test('does not switch to the auth shell before the authed outlet commits', () => {
		mocks.location = {
			pathname: '/login',
			search: {},
			searchStr: '',
		};
		mocks.resolvedLocation = {
			pathname: '/staff/staff-users',
			search: {},
			searchStr: '',
		};

		render(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		expect(screen.getByTestId('app-shell-shell')).toBeTruthy();
		expect(screen.queryByTestId('auth-layout-stub')).toBeNull();
	});

	test('switches to the auth shell with the committed auth match', () => {
		mocks.location = {
			pathname: '/login',
			search: {},
			searchStr: '',
		};
		mocks.resolvedLocation = {
			pathname: '/staff/staff-users',
			search: {},
			searchStr: '',
		};
		mocks.matchedPathname = '/login';

		render(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		expect(screen.getByTestId('auth-layout-stub')).toBeTruthy();
		expect(screen.queryByTestId('app-shell-shell')).toBeNull();
	});

	test('keeps the staff index redirect target while rendering continuous content', async () => {
		const StaffIndexRedirect = StaffIndexRoute.options.component;
		if (!StaffIndexRedirect) {
			throw new Error('Staff index route must have a component');
		}

		render(<StaffIndexRedirect />);

		expect(screen.getByTestId('authed-route-content-skeleton')).toBeTruthy();
		await waitFor(() => {
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/staff/staff-users',
				replace: true,
			});
		});
	});

	test('renders the tenant portal root bare: no app shell chrome around the picker surface', () => {
		mocks.location = {
			pathname: '/tenant',
			search: {},
			searchStr: '',
		};
		mocks.resolvedLocation = mocks.location;
		mocks.matchedPathname = '/tenant';
		mocks.outletPhase = 'settled';

		render(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		expect(screen.getByTestId('route-settled-content')).toBeTruthy();
		expect(screen.queryByTestId('app-shell-shell')).toBeNull();
		expect(screen.queryByTestId('app-shell-rail')).toBeNull();
		expect(screen.queryByTestId('app-shell-topbar')).toBeNull();
		expect(screen.queryByTestId('neutral-authed-shell')).toBeNull();
		expect(screen.queryByTestId('user-menu-stub')).toBeNull();
	});

	test('mounts tenant child paths inside the AppShell once the session validates (round 4)', () => {
		mocks.location = {
			pathname: '/tenant/account',
			search: {},
			searchStr: '',
		};
		mocks.resolvedLocation = mocks.location;
		mocks.matchedPathname = '/tenant/account';

		// Pending session validation at a tenant CHILD path: like any staff
		// path, the neutral shell preserves the AppShell geometry until the
		// session validates — the unresolved branch inside the tenant route
		// redirects to the bare `/tenant` root, so no chrome needs to be
		// withheld from the subtree (PR #1131 round 3 finding 1 fixed at the
		// unresolved branch, not at the shell).
		mocks.sessionQueryState = {
			data: undefined,
			error: undefined,
			status: 'pending',
		};

		const view = render(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		expect(screen.getByTestId('route-loading-content')).toBeTruthy();
		expect(screen.getByTestId('neutral-authed-shell')).toBeTruthy();
		expect(screen.queryByTestId('app-shell-shell')).toBeNull();
		expect(screen.queryByTestId('user-menu-stub')).toBeNull();

		mocks.sessionQueryState = {
			data: 'tenant',
			error: undefined,
			status: 'success',
		};
		view.rerender(
			<RoutedShell>
				<RouteContent />
			</RoutedShell>,
		);

		// A validated session at a tenant child path renders the FULL AppShell
		// chrome: one <main>, the rail (whose entries come from the
		// TENANT_ROUTES metadata), the topbar, and the user menu with logout.
		const shell = screen.getByTestId('app-shell-shell');
		expect(screen.queryByTestId('neutral-authed-shell')).toBeNull();
		expect(shell.querySelectorAll('main')).toHaveLength(1);
		expect(screen.getByTestId('app-shell-rail')).toBeTruthy();
		expect(screen.getByTestId('app-shell-topbar')).toBeTruthy();
		expect(screen.getByTestId('user-menu-stub')).toBeTruthy();
		expect(screen.getByTestId('route-loading-content')).toBeTruthy();
	});
});
