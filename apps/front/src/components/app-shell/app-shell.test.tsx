/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	isDesktop: true,
	linkPrevSearch: {} as Record<string, unknown>,
	workspaceTenantId: null as string | null,
	// Captures the `enabled` flag the shell passes to the picker hook — the
	// staff-surface regression guard below asserts it stays false there.
	workspacePickerEnabled: null as boolean | null,
	// When true, the picker-hook mock delegates to the REAL
	// `useResolvedWorkspaceTenantId` so the request-counting proof suite can
	// exercise the genuine hook -> query -> client chain. Default false keeps
	// every other describe on the cheap capture stub.
	useRealWorkspaceHook: false,
	// Number of times the faked tenant-scope client served a picker GET.
	pickerGetCallCount: 0,
	// Not exercising breadcrumb behavior in this file (this app-shell unit
	// suite mocks the router wholesale — the AUTHORITATIVE breadcrumb tests
	// use a real router + real routeTree, see breadcrumb-contract.test.tsx).
	// A single `'shell'` match is enough for the OTHER describe blocks here
	// (secondary-panel toggle etc.) to render a harmless one-crumb trail.
	matches: [
		{
			pathname: '/staff/staff-users',
			params: {} as Record<string, string>,
			staticData: { crumbs: 'shell' as const },
		},
	],
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		search,
		...props
	}: {
		children?: ReactNode;
		to: string;
		search?: unknown;
	}) => {
		const resolvedSearch =
			typeof search === 'function'
				? (search as (prev: unknown) => Record<string, unknown>)(
						mocks.linkPrevSearch,
					)
				: search;
		return createElement(
			'a',
			{
				href: to,
				'data-search':
					resolvedSearch !== undefined
						? JSON.stringify(resolvedSearch)
						: undefined,
				...props,
			},
			children,
		);
	},
	useMatches: ({ select }: { select: (matches: unknown[]) => void }) =>
		select(mocks.matches),
}));

vi.mock('./user-menu', () => ({
	AppShellUserMenu: () =>
		createElement('div', { 'data-testid': 'app-shell-user-menu-stub' }),
}));

vi.mock('~/lib/hooks/use-media-query', () => ({
	useMediaQuery: () => mocks.isDesktop,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

// Task 7 (C3): the shell mounts the needs-reconnect banner on tenant
// surfaces. These seams are mocked wholesale here because this suite has no
// QueryClient; the banner's own behaviour lives in its dedicated suite.
vi.mock('~/lib/query/tenants-for-picker', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('~/lib/query/tenants-for-picker')>();
	return {
		...original,
		useResolvedWorkspaceTenantId: (options?: { enabled?: boolean }) => {
			if (mocks.useRealWorkspaceHook) {
				return original.useResolvedWorkspaceTenantId(options);
			}
			mocks.workspacePickerEnabled = options?.enabled ?? null;
			return mocks.workspaceTenantId;
		},
	};
});
// Counted stand-in for the tenant-scope API client: the proof suite asserts
// on how often the picker endpoint is actually asked for, per surface.
vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateTenantScopeClient: () => ({
			auth: {
				tenantsForPicker: {
					get: async () => {
						mocks.pickerGetCallCount += 1;
						return {
							tenants: [
								{
									id: { toString: () => 't-1' },
									name: 'Tenant One',
									code: 'T1',
									status: 'ACTIVE',
								},
							],
							activeCount: 1,
							totalCount: 1,
							hasSuspendedTenants: false,
						};
					},
				},
			},
		}),
	}),
}));
vi.mock('./_needs-reconnect-banner', () => ({
	NeedsReconnectBanner: () =>
		createElement(
			'div',
			{ 'data-testid': 'needs-reconnect-banner-stub' },
			'stub',
		),
}));

vi.mock('~/components/ui/drawer', () => ({
	Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
		open
			? createElement('div', { 'data-testid': 'drawer-root' }, children)
			: null,
	DrawerContent: ({
		children,
		...props
	}: {
		children: ReactNode;
		[key: string]: unknown;
	}) => createElement('div', props, children),
	DrawerHeader: ({ children }: { children: ReactNode }) =>
		createElement('div', null, children),
	DrawerTitle: ({ children }: { children: ReactNode }) =>
		createElement('h2', null, children),
	DrawerBody: ({
		children,
		...props
	}: {
		children: ReactNode;
		[key: string]: unknown;
	}) => createElement('div', props, children),
}));

import { useUiStore } from '~/lib/store/ui-store';

import { AppShell } from './app-shell';

const LIST_ROUTE = '/staff/staff-users';
const DETAIL_ROUTE = '/staff/staff-users/u-1';
const DETAIL_ROUTE_OTHER = '/staff/invitations/i-1';

const resetUiStore = () => {
	useUiStore.setState({
		colorScheme: 'light',
		sidebarOpen: true,
	});
};

describe('AppShell secondary-panel toggle', () => {
	beforeEach(() => {
		mocks.isDesktop = true;
		window.localStorage.clear();
		resetUiStore();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('enables panel motion only after two post-hydration frames', () => {
		const frameCallbacks: FrameRequestCallback[] = [];
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			frameCallbacks.push(callback);
			return frameCallbacks.length;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(
			() => undefined,
		);

		render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		const workspace = screen.getByTestId('app-shell-shell');
		expect(workspace.hasAttribute('data-motion-ready')).toBe(false);

		act(() => frameCallbacks.shift()?.(0));
		expect(workspace.hasAttribute('data-motion-ready')).toBe(false);

		act(() => frameCallbacks.shift()?.(16));
		expect(workspace.getAttribute('data-motion-ready')).toBe('true');
	});

	test('list route: toggle is visible and open by default on desktop', () => {
		render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		const workspace = screen.getByTestId('app-shell-shell');
		const panel = screen.getByTestId('app-shell-secondary-panel');
		expect(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeTruthy();
		expect(workspace.getAttribute('data-has-secondary-panel')).toBe('true');
		expect(workspace.getAttribute('data-panel-open')).toBe('true');
		expect(
			panel.querySelector('.app-shell-secondary-panel-inner'),
		).toBeTruthy();
		expect(panel.hasAttribute('inert')).toBe(false);
		expect(panel.hasAttribute('aria-hidden')).toBe(false);
	});

	test('list route to detail route preserves sidebarOpen without flipping', () => {
		const { rerender } = render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		expect(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeTruthy();
		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();

		rerender(
			<AppShell mode="authed" pathname={DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		expect(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeTruthy();
		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();
	});

	test('detail route still reflects a persisted open preference', () => {
		render(
			<AppShell mode="authed" pathname={DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		expect(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeTruthy();
		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();
	});

	test('clicking the toggle on a detail route closes the panel', () => {
		render(
			<AppShell mode="authed" pathname={DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		);

		const workspace = screen.getByTestId('app-shell-shell');
		const panel = screen.getByTestId('app-shell-secondary-panel');
		expect(workspace.getAttribute('data-panel-open')).toBe('false');
		expect(panel.hasAttribute('inert')).toBe(true);
		expect(panel.getAttribute('aria-hidden')).toBe('true');
		expect(
			screen.getByRole('button', { name: 'expand-navigation-panel' }),
		).toBeTruthy();
	});

	test('detail-route choice carries over when navigating between detail routes', () => {
		const { rerender } = render(
			<AppShell mode="authed" pathname={DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		);
		expect(
			screen.getByTestId('app-shell-secondary-panel').hasAttribute('inert'),
		).toBe(true);

		rerender(
			<AppShell mode="authed" pathname={DETAIL_ROUTE_OTHER}>
				content
			</AppShell>,
		);

		expect(
			screen.getByTestId('app-shell-secondary-panel').hasAttribute('inert'),
		).toBe(true);
		expect(
			screen.getByRole('button', { name: 'expand-navigation-panel' }),
		).toBeTruthy();
	});

	test('detail route still reflects a persisted closed preference', () => {
		useUiStore.setState({ sidebarOpen: false });

		render(
			<AppShell mode="authed" pathname={DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		expect(
			screen.getByRole('button', { name: 'expand-navigation-panel' }),
		).toBeTruthy();
		const panel = screen.getByTestId('app-shell-secondary-panel');
		expect(panel.hasAttribute('inert')).toBe(true);
		expect(panel.getAttribute('aria-hidden')).toBe('true');
	});

	test('below desktop width: toggle is hidden on both list and rail-only routes', () => {
		mocks.isDesktop = false;

		const { rerender } = render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);
		expect(
			screen.queryByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeNull();
		expect(
			screen.queryByRole('button', { name: 'expand-navigation-panel' }),
		).toBeNull();
		expect(screen.queryByTestId('app-shell-secondary-panel')).toBeNull();

		rerender(
			<AppShell mode="authed" pathname={DETAIL_ROUTE}>
				content
			</AppShell>,
		);
		expect(
			screen.queryByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeNull();
		expect(
			screen.queryByRole('button', { name: 'expand-navigation-panel' }),
		).toBeNull();
		expect(screen.queryByTestId('app-shell-secondary-panel')).toBeNull();
	});
});

describe('AppShell navigation reality (no dead links, no fabricated data)', () => {
	beforeEach(() => {
		mocks.isDesktop = true;
		window.localStorage.clear();
		resetUiStore();
	});

	afterEach(() => {
		cleanup();
	});

	test('the rail renders only routes that actually exist — no audit-logs', () => {
		const { container } = render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		const railItemIds = Array.from(
			container.querySelectorAll('[data-rail-item]'),
		).map((el) => el.getAttribute('data-rail-item'));

		expect(railItemIds).toEqual(['dashboard', 'tenants', 'staff']);
	});

	test('the tenant scope rail renders the four workspace modules', () => {
		const { container } = render(
			<AppShell mode="authed" pathname="/tenant/account">
				content
			</AppShell>,
		);

		const railItemIds = Array.from(
			container.querySelectorAll('[data-rail-item]'),
		).map((el) => el.getAttribute('data-rail-item'));

		expect(railItemIds).toEqual([
			'account',
			'settings',
			'posts',
			'organizations',
		]);
	});

	test('no secondary-nav item ever renders a count badge', () => {
		const { container } = render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		expect(
			container.querySelector('.app-shell-secondary-nav-count'),
		).toBeNull();
	});

	test('a mobile nav affordance exists and opens the rail + panel items in a drawer', () => {
		render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		const toggle = screen.getByTestId('app-shell-mobile-nav-toggle');
		expect(toggle).toBeTruthy();
		expect(screen.queryByTestId('drawer-root')).toBeNull();

		fireEvent.click(toggle);

		const drawer = screen.getByTestId('drawer-root');
		expect(drawer).toBeTruthy();

		const drawerRailItemIds = Array.from(
			drawer.querySelectorAll('[data-rail-item]'),
		).map((el) => el.getAttribute('data-rail-item'));
		expect(drawerRailItemIds).toEqual(['dashboard', 'tenants', 'staff']);

		// Each rail item must be reachable BY NAME in the drawer, not just by
		// testid/data-rail-item — a column of bare icon glyphs with only an
		// aria-label is ambiguous in a full-width sheet (r3-shell-F6).
		expect(
			within(drawer).getByRole('link', { name: 'nav-dashboard' }),
		).toBeTruthy();
		expect(
			within(drawer).getByRole('link', { name: 'nav-tenants' }),
		).toBeTruthy();
		expect(
			within(drawer).getByRole('link', { name: 'nav-staff' }),
		).toBeTruthy();
	});
});

describe('AppShell secondary-panel status links preserve the toolbar search state (r3-tenants-F5)', () => {
	afterEach(() => {
		cleanup();
		mocks.linkPrevSearch = {};
	});

	test('a panel status link keeps q/sort/size and sets (or clears) only status', () => {
		mocks.linkPrevSearch = {
			q: 'ac',
			sortId: 'name',
			size: 50,
			status: 'suspended',
		};

		render(
			<AppShell
				mode="authed"
				pathname="/staff/tenants"
				search={{ status: 'suspended' }}
			>
				content
			</AppShell>,
		);

		const activeLink = screen.getByRole('link', { name: 'nav-tenants-active' });
		const search = JSON.parse(activeLink.getAttribute('data-search') ?? '{}');
		expect(search).toMatchObject({ q: 'ac', sortId: 'name', size: 50 });
		expect(search.status).toBe('active');
		expect(search.cursor).toBeUndefined();

		const allLink = screen.getByRole('link', { name: 'nav-tenants-all' });
		const allSearch = JSON.parse(allLink.getAttribute('data-search') ?? '{}');
		expect(allSearch).toMatchObject({ q: 'ac', sortId: 'name', size: 50 });
		expect(allSearch.status).toBeUndefined();
	});
});

describe('AppShell needs-reconnect banner mount point', () => {
	beforeEach(() => {
		mocks.isDesktop = true;
		resetUiStore();
	});

	afterEach(() => {
		cleanup();
	});

	test('mounts above main on tenant surfaces when a workspace is resolved', () => {
		mocks.workspaceTenantId = 't-1';

		render(
			<AppShell mode="authed" pathname="/tenant/settings/integrations">
				content
			</AppShell>,
		);

		const banner = screen.getByTestId('needs-reconnect-banner-stub');
		expect(
			banner.nextElementSibling?.classList.contains('app-shell-main'),
		).toBe(true);
	});

	test('renders no banner before a workspace tenant is resolved', () => {
		mocks.workspaceTenantId = null;

		render(
			<AppShell mode="authed" pathname="/tenant/settings/integrations">
				content
			</AppShell>,
		);

		expect(screen.queryByTestId('needs-reconnect-banner-stub')).toBeNull();
	});

	test('renders no banner on staff surfaces', () => {
		mocks.workspaceTenantId = 't-1';

		render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		expect(screen.queryByTestId('needs-reconnect-banner-stub')).toBeNull();
	});

	test('disables the tenant-scope picker fetch on staff surfaces', () => {
		mocks.workspaceTenantId = 't-1';

		render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		// The picker request carries only the tenant session token; letting it
		// run on a staff surface sends an unauthenticated 401 that the central
		// backstop answers with a full logout.
		expect(mocks.workspacePickerEnabled).toBe(false);
	});

	test('enables the tenant-scope picker fetch on tenant surfaces', () => {
		mocks.workspaceTenantId = 't-1';

		render(
			<AppShell mode="authed" pathname="/tenant/settings/integrations">
				content
			</AppShell>,
		);

		expect(mocks.workspacePickerEnabled).toBe(true);
	});
});

// PROOF (C3 root cause): the mass front-e2e failure was the shared authed
// shell firing the tenant-scoped `tenants-for-picker` request on STAFF
// surfaces, where no tenant session token exists — the resulting 401 tripped
// the central logged-out-on-401 backstop. Unlike the capture-stub tests
// above (which assert the `enabled` ARGUMENT the shell passes), this suite
// swaps the hook mock for the REAL `useResolvedWorkspaceTenantId` and counts
// calls on a faked client, so it fails if the request goes out by ANY path.
describe('AppShell issues no tenants-for-picker request on staff surfaces', () => {
	let queryClient: QueryClient;

	const renderShellUnderQueryClient = (pathname: string) =>
		render(
			<AppShell mode="authed" pathname={pathname}>
				content
			</AppShell>,
			{
				wrapper: ({ children }: { children: ReactNode }) => (
					<QueryClientProvider client={queryClient}>
						{children}
					</QueryClientProvider>
				),
			},
		);

	beforeEach(() => {
		mocks.isDesktop = true;
		mocks.useRealWorkspaceHook = true;
		window.localStorage.clear();
		resetUiStore();
		mocks.pickerGetCallCount = 0;
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
	});

	afterEach(() => {
		cleanup();
		mocks.useRealWorkspaceHook = false;
		queryClient.clear();
	});

	test('staff surface: the picker endpoint is never fetched', async () => {
		renderShellUnderQueryClient(LIST_ROUTE);

		// Flush scheduling so a regressed fetch would be counted by now:
		// with `enabled: false` TanStack Query never even starts one.
		await act(async () => {});

		expect(mocks.pickerGetCallCount).toBe(0);
	});

	test('tenant surface: the picker endpoint is fetched exactly once', async () => {
		renderShellUnderQueryClient('/tenant/settings/integrations');

		await waitFor(() => expect(mocks.pickerGetCallCount).toBe(1));
	});
});
