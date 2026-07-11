/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	clearSession: vi.fn(),
	queryClientClear: vi.fn(),
	currentUser: undefined as
		| {
				id: string;
				email: string;
				firstName: string | null;
				lastName: string | null;
				avatarUrl: string | null;
				displayName: string | null;
		  }
		| undefined,
}));

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => mocks.navigate,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({ clear: mocks.queryClientClear }),
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

vi.mock('~/lib/server/session-actions', () => ({
	clearSession: mocks.clearSession,
}));

vi.mock('~/lib/query/auth', () => ({
	useCurrentUserQuery: () => ({ data: mocks.currentUser }),
	toCurrentUser: (raw: unknown) => raw,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				'log-out': 'Log out',
				'un-named': 'No name',
			};
			return labels[key] ?? key;
		},
	}),
}));

import { AppShellUserMenu } from './user-menu';

describe('AppShellUserMenu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.clearSession.mockResolvedValue(undefined);
		mocks.currentUser = {
			id: 'user-1',
			email: 'jane.doe@example.com',
			firstName: 'Jane',
			lastName: 'Doe',
			avatarUrl: null,
			displayName: 'Jane Doe',
		};
	});

	afterEach(() => {
		cleanup();
	});

	test('opens the menu from the trigger and shows the current user name and email', async () => {
		render(<AppShellUserMenu />);

		expect(screen.queryByTestId('app-shell-user-menu')).toBeNull();
		fireEvent.click(screen.getByTestId('app-shell-user-menu-trigger'));

		const menu = await screen.findByTestId('app-shell-user-menu');
		expect(menu).toBeTruthy();
		expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
		expect(screen.getByText('jane.doe@example.com')).toBeTruthy();
	});

	test('falls back to the un-named label when the user has no display name yet', async () => {
		mocks.currentUser = undefined;
		render(<AppShellUserMenu />);

		expect(screen.getAllByText('No name').length).toBeGreaterThan(0);
	});

	test('clicking Logout clears the query cache and server session, then navigates to /login without redirect_cause', async () => {
		render(<AppShellUserMenu />);

		fireEvent.click(screen.getByTestId('app-shell-user-menu-trigger'));
		const logoutItem = await screen.findByTestId('app-shell-user-menu-logout');
		fireEvent.click(logoutItem);

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));

		expect(mocks.queryClientClear).toHaveBeenCalledTimes(1);
		expect(mocks.clearSession).toHaveBeenCalledTimes(1);
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/login',
			search: undefined,
			replace: true,
		});
	});
});
