/** @vitest-environment jsdom */
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	isDesktop: true,
	linkPrevSearch: {} as Record<string, unknown>,
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

import { SIDEBAR_OPEN_STORAGE_KEY, useUiStore } from '~/lib/store/ui-store';

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

	test('a persisted closed preference holds on the FIRST render, before any hydration effect (#936)', async () => {
		// The regression this pins: the store used to initialize to the open
		// default and only read localStorage inside ThemeHydrationListener's
		// post-commit effect, so the real shell rendered OPEN for one window
		// and then flipped — the rotating shell.spec.ts e2e flake class. The
		// store must instead seed itself from localStorage at module load, so
		// re-importing the module with the preference present must produce a
		// store whose INITIAL state is already collapsed.
		window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, 'false');

		vi.resetModules();
		const { useUiStore: freshStore } = await import('~/lib/store/ui-store');

		expect(freshStore.getState().sidebarOpen).toBe(false);
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
