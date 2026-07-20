/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	location: {
		pathname: '/staff',
		search: {} as Record<string, unknown>,
		searchStr: '',
	},
	resolvedLocation: {
		pathname: '/staff',
		search: {} as Record<string, unknown>,
		searchStr: '',
	},
	matchedPathname: '/staff',
	navigate: vi.fn(),
	outletPhase: 'loading' as 'loading' | 'settled',
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
		useMatches: ({ select }: { select: (matches: unknown[]) => unknown }) =>
			select([
				{
					pathname: mocks.matchedPathname,
					search: mocks.location.search,
				},
			]),
		useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
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
	mocks.navigate.mockReset();
	mocks.outletPhase = 'loading';
});

describe('authenticated shell continuity', () => {
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
});
