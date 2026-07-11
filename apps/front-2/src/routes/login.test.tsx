/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	invalidate: vi.fn(),
	searchStr: '',
	login: vi.fn(),
	completeLoginRedirect: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	useNavigate: () => mocks.navigate,
	useLocation: () => ({ searchStr: mocks.searchStr }),
	useRouter: () => ({ invalidate: mocks.invalidate }),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

vi.mock('~/lib/server/session-actions', () => ({
	login: mocks.login,
	completeLoginRedirect: mocks.completeLoginRedirect,
}));

const EN_LABELS: Record<string, string> = {
	'sign-in': 'Sign in',
	'welcome-back': 'Welcome back',
	'no-account-yet': 'No account yet?',
	'create-one': 'Create one',
	'email-address': 'Email address',
	password: 'Password',
	'forgot-password': 'Forgot password',
	'email-placeholder': 'name@company.com',
	'enter-your-password': 'Enter your password',
	'show-password': 'Show password',
	'hide-password': 'Hide password',
	'signing-in': 'Signing in…',
	'session-expired-notice': 'Your session expired. Please sign in again.',
	'sign-in-to-pick-up-where-you-left-off':
		'Sign in to pick up where you left off.',
	'invalid-credentials-description':
		'Invalid credentials. Please check your email and password.',
	'enter-valid-email-and-password': 'Enter a valid email and password.',
	'sign-in-failed-check-credentials':
		'Sign in failed. Please check your credentials.',
	'enter-valid-email-address': 'Enter a valid email address.',
	'password-is-required': 'Password is required.',
	'terms-of-service': 'Terms of service',
	'privacy-policy': 'Privacy policy',
	'go-to-home': 'Go to home',
	retry: 'Retry',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { language: 'en' },
	}),
}));

import { Route } from './login';

const renderLoginRoute = () => {
	const Component = (
		Route as unknown as { component: () => ReturnType<typeof createElement> }
	).component;
	return render(createElement(Component));
};

const fillCredentials = (email: string, password: string) => {
	fireEvent.change(screen.getByLabelText('Email address'), {
		target: { value: email },
	});
	fireEvent.change(screen.getByLabelText('Password'), {
		target: { value: password },
	});
};

describe('login route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.searchStr = '';
		mocks.completeLoginRedirect.mockResolvedValue({ targetPath: '/staff' });
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the default sign-in state through i18n copy', async () => {
		renderLoginRoute();

		expect(
			screen.getByRole('heading', { level: 1, name: 'Sign in' }),
		).toBeTruthy();
		expect(screen.getByText('No account yet?')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Create one' })).toHaveProperty(
			'href',
			expect.stringContaining('/signup'),
		);
		expect(
			screen.getByRole('link', { name: 'Forgot password?' }),
		).toHaveProperty('href', expect.stringContaining('/reset-password'));
		expect(screen.getByLabelText('Email address')).toBeTruthy();
		expect(screen.getByLabelText('Password')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
	});

	test('shows the session-expired banner and swaps the heading to Welcome back', () => {
		mocks.searchStr = '?rc=invalid_session';

		renderLoginRoute();

		expect(
			screen.getByText('Your session expired. Please sign in again.'),
		).toBeTruthy();
		expect(
			screen.getByRole('heading', { level: 1, name: 'Welcome back' }),
		).toBeTruthy();
		expect(
			screen.getByText('Sign in to pick up where you left off.'),
		).toBeTruthy();
		expect(screen.queryByText('No account yet?')).toBeNull();
	});

	test('disables the form and shows the submitting label while awaiting the server function', async () => {
		let resolveLogin: (value: { sessionExpiresAt: string }) => void = () => {};
		mocks.login.mockReturnValue(
			new Promise((resolve) => {
				resolveLogin = resolve;
			}),
		);

		renderLoginRoute();
		fillCredentials('user@example.com', 'correct-horse-battery-staple');
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Signing in/ })).toBeTruthy(),
		);
		// jsdom does not emulate the native fieldset-disables-descendants
		// cascade, so assert on the fieldset itself rather than the inputs.
		expect(
			screen.getByLabelText('Email address').closest('fieldset'),
		).toHaveProperty('disabled', true);

		resolveLogin({ sessionExpiresAt: '2026-01-01T00:00:00.000Z' });
		await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
	});

	test('shows the invalid-credentials alert and marks the password field invalid on 401', async () => {
		mocks.login.mockRejectedValue({ status: 401 });

		renderLoginRoute();
		fillCredentials('user@example.com', 'wrong-password');
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() =>
			expect(
				screen.getByText(
					'Invalid credentials. Please check your email and password.',
				),
			).toBeTruthy(),
		);
		expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe(
			'true',
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
