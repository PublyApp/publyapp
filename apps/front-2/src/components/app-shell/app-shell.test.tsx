/** @vitest-environment jsdom */
import {
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
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
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

import { useUiStore } from '~/lib/store/ui-store';

import { AppShell } from './app-shell';

const LIST_ROUTE = '/staff/staff-users';
const RAIL_ONLY_DETAIL_ROUTE = '/staff/staff-users/u-1';
const RAIL_ONLY_DETAIL_ROUTE_OTHER = '/staff/invitations/i-1';

const resetUiStore = () => {
	useUiStore.setState({
		colorScheme: 'light',
		sidebarOpen: true,
		railOnlyPanelOpen: false,
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
	});

	test('list route: toggle is visible and open by default on desktop', () => {
		render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		expect(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeTruthy();
		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();
	});

	test('rail-only detail route: toggle is visible but the panel is closed by default', () => {
		render(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		expect(
			screen.getByRole('button', { name: 'expand-navigation-panel' }),
		).toBeTruthy();
		expect(screen.queryByTestId('app-shell-secondary-panel')).toBeNull();
	});

	test('clicking the toggle on a rail-only route opens the panel', () => {
		render(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'expand-navigation-panel' }),
		);

		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeTruthy();
	});

	test('an explicit rail-only open choice carries over when navigating to another rail-only route', () => {
		const { rerender } = render(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'expand-navigation-panel' }),
		);
		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();

		rerender(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE_OTHER}>
				content
			</AppShell>,
		);

		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeTruthy();
	});

	test('a fresh session (no explicit choice) always starts closed on a rail-only route', () => {
		render(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		expect(screen.queryByTestId('app-shell-secondary-panel')).toBeNull();
	});

	test('list-route default-open behavior is unaffected by the rail-only flag', () => {
		useUiStore.setState({ railOnlyPanelOpen: true });

		render(
			<AppShell mode="authed" pathname={LIST_ROUTE}>
				content
			</AppShell>,
		);

		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeTruthy();
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

		rerender(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE}>
				content
			</AppShell>,
		);
		expect(
			screen.queryByRole('button', { name: 'collapse-navigation-panel' }),
		).toBeNull();
		expect(
			screen.queryByRole('button', { name: 'expand-navigation-panel' }),
		).toBeNull();
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

	test('the rail renders only routes that actually exist — no audit-logs, no tenant rail', () => {
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

	test('the tenant scope rail has no items (only /tenant is registered)', () => {
		const { container } = render(
			<AppShell mode="authed" pathname="/tenant">
				content
			</AppShell>,
		);

		expect(container.querySelectorAll('[data-rail-item]').length).toBe(0);
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
