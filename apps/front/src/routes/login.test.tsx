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
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	invalidate: vi.fn(),
	searchStr: '',
	login: vi.fn(),
	completeLoginRedirect: vi.fn(),
	postBroadcast: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
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

vi.mock('~/lib/tab-sync/broadcast-sync', () => ({
	AUTH_SYNC_CHANNEL: 'publyapp:auth-sync',
	postBroadcast: mocks.postBroadcast,
}));

const EN_LABELS: TestLabelMap = {
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
	'password-reset-success': 'Password reset successfully',
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
		t: (key: string) => {
			const resolvedKey = key.replace(/^common:/, '');
			return EN_LABELS[resolvedKey] ?? resolvedKey;
		},
		i18n: { language: 'en' },
	}),
}));

import {
	getSafeSearchRedirect,
	isAllowedRedirectPath,
	resolveRouteRedirect,
} from '@org/shared-ts/lib/safe-redirect-path';

import { Route } from './login';

const renderLoginRoute = () => {
	const Component = Route.options.component as () => ReturnType<
		typeof createElement
	>;
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
	test('declares the auth i18n namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual(['auth']);
	});

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

	test('shows the password-reset-success banner without swapping the heading', () => {
		mocks.searchStr = '?rc=password_reset_success';

		renderLoginRoute();

		expect(screen.getByText('Password reset successfully')).toBeTruthy();
		expect(
			screen.getByRole('heading', { level: 1, name: 'Sign in' }),
		).toBeTruthy();
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
		expect(mocks.postBroadcast).toHaveBeenCalledWith('publyapp:auth-sync', {
			type: 'login',
		});
	});

	test('does not broadcast a login on failed credentials', async () => {
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
		expect(mocks.postBroadcast).not.toHaveBeenCalled();
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

	test('maps a 422 email validation failure onto the email field using the API PascalCase key', async () => {
		// ValidationResult.ToDictionary() (ReqBodyValidationFilter.cs) keys 422
		// errors by PascalCase PropertyName — never camelCase (r3-F2).
		mocks.login.mockRejectedValue({
			status: 422,
			errors: { Email: ['Enter a valid email address.'] },
		});

		renderLoginRoute();
		fillCredentials('user@example.com', 'correct-horse-battery-staple');
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() =>
			expect(screen.getByText('Enter a valid email address.')).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('prefills the email field from the ?email= search param (the invitation-login handoff)', () => {
		mocks.searchStr = '?email=invitee%40example.com';

		renderLoginRoute();

		expect(screen.getByLabelText('Email address')).toHaveProperty(
			'value',
			'invitee@example.com',
		);
	});

	test('honors a redirect_to pointing back at /accept-invitation after signing in', async () => {
		mocks.searchStr = `?rto=${encodeURIComponent('/accept-invitation?id=abc&token=xyz')}`;
		mocks.login.mockResolvedValue({
			sessionExpiresAt: '2026-01-01T00:00:00.000Z',
		});

		renderLoginRoute();
		fillCredentials('invitee@example.com', 'correct-horse-battery-staple');
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/accept-invitation?id=abc&token=xyz',
				replace: true,
			}),
		);
	});
});

describe('resolveRouteRedirect', () => {
	test('rejects protocol-relative and backslash-based open-redirect attempts', () => {
		expect(resolveRouteRedirect('//evil.com')).toBe('/');
		expect(resolveRouteRedirect('/\\evil.com')).toBe('/');
		expect(resolveRouteRedirect('/\\/evil.com')).toBe('/');
		expect(resolveRouteRedirect('https://evil.com')).toBe('/');
		expect(resolveRouteRedirect('')).toBe('/');
		expect(resolveRouteRedirect(null)).toBe('/');
	});

	test('passes through a safe relative path', () => {
		expect(resolveRouteRedirect('/staff/tenants')).toBe('/staff/tenants');
		expect(resolveRouteRedirect('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com');
	});
});

describe('getSafeSearchRedirect', () => {
	test('extracts and sanitises the rto search param', () => {
		expect(getSafeSearchRedirect('?rto=%2Fstaff')).toBe('/staff');
		expect(
			getSafeSearchRedirect(`?rto=${encodeURIComponent('//evil.com')}`),
		).toBe('/');
		expect(getSafeSearchRedirect('')).toBe('/');
	});
});

describe('isAllowedRedirectPath', () => {
	test('allows a requested path under the resolved surface', () => {
		expect(isAllowedRedirectPath('/staff/tenants', '/staff')).toBe(true);
		expect(isAllowedRedirectPath('/staff', '/staff')).toBe(true);
	});

	test('rejects a requested path outside the resolved surface', () => {
		expect(isAllowedRedirectPath('/staff/tenants?q=x', '/tenant')).toBe(false);
	});

	test('always allows the accept-invitation return path, regardless of surface', () => {
		expect(
			isAllowedRedirectPath('/accept-invitation?id=abc&token=xyz', '/tenant'),
		).toBe(true);
		expect(isAllowedRedirectPath('/accept-invitation', '/staff')).toBe(true);
	});

	test('rejects open-redirect attempts', () => {
		expect(isAllowedRedirectPath('//evil.com', '/tenant')).toBe(false);
		expect(isAllowedRedirectPath('/\\evil.com', '/tenant')).toBe(false);
		expect(isAllowedRedirectPath('https://evil.com', '/tenant')).toBe(false);
		expect(isAllowedRedirectPath('', '/tenant')).toBe(false);
	});
});
