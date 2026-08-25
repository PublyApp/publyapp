/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	invalidate: vi.fn().mockResolvedValue(undefined),
	clearSession: vi.fn(),
	setLocale: vi.fn(),
	postBroadcast: vi.fn(),
	queryClientClear: vi.fn(),
	resolvedLanguage: 'en' as string,
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
	useRouter: () => ({ invalidate: mocks.invalidate }),
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

vi.mock('~/server/i18n-locale', () => ({
	setLocale: mocks.setLocale,
}));

vi.mock('~/lib/tab-sync/broadcast-sync', () => ({
	AUTH_SYNC_CHANNEL: 'publyapp:auth-sync',
	LOCALE_SYNC_CHANNEL: 'publyapp:locale-sync',
	THEME_SYNC_CHANNEL: 'publyapp:theme-sync',
	postBroadcast: mocks.postBroadcast,
}));

vi.mock('~/lib/query/auth', () => ({
	useCurrentUserQuery: () => ({ data: mocks.currentUser }),
	toCurrentUser: (raw: unknown) => raw,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: TestLabelMap = {
				'log-out': 'Log out',
				'un-named': 'No name',
				language: 'Language',
				'switch-to-light-mode': 'Switch to light mode',
				'switch-to-dark-mode': 'Switch to dark mode',
			};
			return labels[key] ?? key;
		},
		i18n: { resolvedLanguage: mocks.resolvedLanguage },
	}),
}));

import { __resetLogoutInFlightForTests } from '~/lib/hooks/use-logout';
import { useUiStore } from '~/lib/store/ui-store';

import { AppShellUserMenu } from './user-menu';

describe('AppShellUserMenu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		__resetLogoutInFlightForTests();
		mocks.clearSession.mockResolvedValue(undefined);
		mocks.navigate.mockResolvedValue(undefined);
		mocks.setLocale.mockResolvedValue({ locale: 'fr' });
		mocks.invalidate.mockResolvedValue(undefined);
		mocks.resolvedLanguage = 'en';
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
		// The cache clear fires only after navigation is initiated (see
		// 46424dcc) — wait for it separately instead of asserting it
		// synchronously alongside navigate.
		await waitFor(() =>
			expect(mocks.queryClientClear).toHaveBeenCalledTimes(1),
		);

		expect(mocks.clearSession).toHaveBeenCalledTimes(1);
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/login',
			search: undefined,
			replace: true,
			ignoreBlocker: true,
		});

		const navigateOrder = mocks.navigate.mock.invocationCallOrder[0];
		const queryClientClearOrder =
			mocks.queryClientClear.mock.invocationCallOrder[0];
		expect(navigateOrder).toBeLessThan(queryClientClearOrder);
	});

	test('offers a theme toggle in the menu, so the authed shell has a theme control on a phone (r3-shell-F6)', async () => {
		useUiStore.setState({ colorScheme: 'light' });
		render(<AppShellUserMenu />);

		fireEvent.click(screen.getByTestId('app-shell-user-menu-trigger'));
		const themeItem = await screen.findByTestId('app-shell-user-menu-theme');
		expect(themeItem.textContent).toContain('Switch to dark mode');

		fireEvent.click(themeItem);

		expect(useUiStore.getState().colorScheme).toBe('dark');
	});

	test('opens the language submenu and shows the current locale checked', async () => {
		render(<AppShellUserMenu />);

		fireEvent.click(screen.getByTestId('app-shell-user-menu-trigger'));
		const languageTrigger = await screen.findByTestId(
			'app-shell-user-menu-language',
		);
		fireEvent.click(languageTrigger);

		const enOption = await screen.findByTestId(
			'app-shell-user-menu-language-en',
		);
		const frOption = await screen.findByTestId(
			'app-shell-user-menu-language-fr',
		);
		expect(enOption.getAttribute('aria-checked')).toBe('true');
		expect(frOption.getAttribute('aria-checked')).toBe('false');
	});

	test('selecting a different locale persists the cookie, broadcasts, then invalidates the router', async () => {
		render(<AppShellUserMenu />);

		fireEvent.click(screen.getByTestId('app-shell-user-menu-trigger'));
		const languageTrigger = await screen.findByTestId(
			'app-shell-user-menu-language',
		);
		fireEvent.click(languageTrigger);

		const frOption = await screen.findByTestId(
			'app-shell-user-menu-language-fr',
		);
		fireEvent.click(frOption);

		await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1));

		expect(mocks.setLocale).toHaveBeenCalledWith({ data: { locale: 'fr' } });
		expect(mocks.postBroadcast).toHaveBeenCalledWith('publyapp:locale-sync', {
			locale: 'fr',
		});
	});

	test('selecting the current locale is a no-op', async () => {
		render(<AppShellUserMenu />);

		fireEvent.click(screen.getByTestId('app-shell-user-menu-trigger'));
		const languageTrigger = await screen.findByTestId(
			'app-shell-user-menu-language',
		);
		fireEvent.click(languageTrigger);

		const enOption = await screen.findByTestId(
			'app-shell-user-menu-language-en',
		);
		fireEvent.click(enOption);

		expect(mocks.setLocale).not.toHaveBeenCalled();
		expect(mocks.postBroadcast).not.toHaveBeenCalled();
	});
});
