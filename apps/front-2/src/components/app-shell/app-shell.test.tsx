/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
			screen.getByRole('button', { name: 'Collapse navigation panel' }),
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
			screen.getByRole('button', { name: 'Expand navigation panel' }),
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
			screen.getByRole('button', { name: 'Expand navigation panel' }),
		);

		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Collapse navigation panel' }),
		).toBeTruthy();
	});

	test('an explicit rail-only open choice carries over when navigating to another rail-only route', () => {
		const { rerender } = render(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE}>
				content
			</AppShell>,
		);

		fireEvent.click(
			screen.getByRole('button', { name: 'Expand navigation panel' }),
		);
		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();

		rerender(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE_OTHER}>
				content
			</AppShell>,
		);

		expect(screen.getByTestId('app-shell-secondary-panel')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Collapse navigation panel' }),
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
			screen.getByRole('button', { name: 'Collapse navigation panel' }),
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
			screen.queryByRole('button', { name: 'Collapse navigation panel' }),
		).toBeNull();
		expect(
			screen.queryByRole('button', { name: 'Expand navigation panel' }),
		).toBeNull();

		rerender(
			<AppShell mode="authed" pathname={RAIL_ONLY_DETAIL_ROUTE}>
				content
			</AppShell>,
		);
		expect(
			screen.queryByRole('button', { name: 'Collapse navigation panel' }),
		).toBeNull();
		expect(
			screen.queryByRole('button', { name: 'Expand navigation panel' }),
		).toBeNull();
	});
});
