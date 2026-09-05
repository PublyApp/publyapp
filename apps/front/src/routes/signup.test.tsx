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
	registerAndRequestEmailVerification: vi.fn(),
	guard: vi.fn(),
	signupsEnabled: false,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	useNavigate: () => mocks.navigate,
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

vi.mock('~/lib/server/auth-actions', () => ({
	registerAndRequestEmailVerification:
		mocks.registerAndRequestEmailVerification,
}));

vi.mock('~/lib/auth-route-guard', () => ({
	redirectAuthenticatedUserAwayFromAuthPage: mocks.guard,
}));

vi.mock('~/lib/flags', () => ({
	get FEATURES() {
		return { auth: { signupsEnabled: mocks.signupsEnabled } };
	},
}));

const EN_LABELS: TestLabelMap = {
	'create-your-account': 'Create your account',
	'already-have-account-question': 'Already have an account?',
	'log-in': 'Log in',
	'signup-closed-notice':
		'New sign-ups are closed for now. If you were invited to a workspace, use your invitation link to join.',
	'auth-first-name': 'First name',
	'auth-last-name': 'Last name',
	'email-address': 'Email address',
	password: 'Password',
	'email-placeholder': 'name@company.com',
	'min-characters-hint': '{{characters}}+ characters',
	'create-account': 'Create account',
	'by-signing-up-agree': 'By signing up, I agree to',
	'terms-of-service': 'Terms of service',
	and: 'and',
	'privacy-policy': 'Privacy policy',
	'first-name-required': 'First name is required',
	'last-name-required': 'Last name is required',
	'enter-valid-email-address': 'Enter a valid email address.',
	'password-min-length-hint': 'Use at least 8 characters.',
	'password-min-length-hint-n': 'Use at least {{characters}} characters.',
	'an-error-occurred': 'An error occurred',
	'show-password': 'Show password',
	'hide-password': 'Hide password',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const resolvedKey = key.replace(/^common:/, '');
			let text = EN_LABELS[resolvedKey] ?? resolvedKey;
			for (const [name, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${name}}}`, String(value));
			}
			return text;
		},
		i18n: { language: 'en' },
	}),
}));

import { redirectAuthenticatedUserAwayFromAuthPage } from '~/lib/auth-route-guard';

import { Route } from './signup';

const renderSignUpRoute = () => {
	const Component = Route.options.component as () => ReturnType<
		typeof createElement
	>;
	return render(createElement(Component));
};

describe('signup route', () => {
	test('declares the auth i18n namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual(['auth']);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.signupsEnabled = false;
	});

	afterEach(() => {
		cleanup();
	});

	test('attaches the authenticated-user redirect guard', () => {
		expect((Route.options as { beforeLoad: unknown }).beforeLoad).toBe(
			redirectAuthenticatedUserAwayFromAuthPage,
		);
	});

	test('renders the closed state with the info banner and disabled fields', () => {
		mocks.signupsEnabled = false;

		renderSignUpRoute();

		expect(screen.getByTestId('signup-closed-alert')).toBeTruthy();
		expect(
			screen.getByRole('heading', { level: 1, name: 'Create your account' }),
		).toBeTruthy();
		expect(
			screen.getByLabelText('First name').closest('fieldset'),
		).toHaveProperty('disabled', true);
		expect(
			screen.getByRole('button', { name: 'Create account' }),
		).toHaveProperty('disabled', true);
	});

	test('renders the enabled state with an active form and no banner', () => {
		mocks.signupsEnabled = true;

		renderSignUpRoute();

		expect(screen.queryByTestId('signup-closed-alert')).toBeNull();
		expect(
			screen.getByLabelText('First name').closest('fieldset'),
		).toHaveProperty('disabled', false);
		expect(
			screen.getByRole('button', { name: 'Create account' }),
		).toHaveProperty('disabled', false);
	});

	test('registers, requests email verification, and redirects to /verify-email on submit', async () => {
		mocks.signupsEnabled = true;
		mocks.registerAndRequestEmailVerification.mockResolvedValue({
			status: 'sent',
			email: 'mara@northwind.co',
		});

		renderSignUpRoute();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Mara' },
		});
		fireEvent.change(screen.getByLabelText('Last name'), {
			target: { value: 'Okonkwo' },
		});
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'mara@northwind.co' },
		});
		fireEvent.change(screen.getByLabelText('Password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

		await waitFor(() =>
			expect(mocks.registerAndRequestEmailVerification).toHaveBeenCalledWith({
				data: {
					firstName: 'Mara',
					lastName: 'Okonkwo',
					email: 'mara@northwind.co',
					password: 'aurora-441789',
				},
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/verify-email',
				search: { email: 'mara@northwind.co' },
			}),
		);
	});

	test('handles failed email verification - still creates account and navigates to retry', async () => {
		mocks.signupsEnabled = true;
		mocks.registerAndRequestEmailVerification.mockResolvedValue({
			status: 'failed',
			email: 'test@example.com',
			cause: {
				kind: 'problem',
				status: 503,
				detail: 'Mail provider unavailable',
			},
		});

		renderSignUpRoute();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Test' },
		});
		fireEvent.change(screen.getByLabelText('Last name'), {
			target: { value: 'User' },
		});
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'test@example.com' },
		});
		fireEvent.change(screen.getByLabelText('Password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

		await waitFor(() =>
			expect(mocks.registerAndRequestEmailVerification).toHaveBeenCalledWith({
				data: {
					firstName: 'Test',
					lastName: 'User',
					email: 'test@example.com',
					password: 'aurora-441789',
				},
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/verify-email',
				search: {
					email: 'test@example.com',
					delivery_status: 'failed',
					delivery_cause: 'Mail provider unavailable',
				},
			}),
		);
	});

	test('shows an inline error and does not navigate when register fails', async () => {
		mocks.signupsEnabled = true;
		mocks.registerAndRequestEmailVerification.mockRejectedValue({
			status: 400,
		});

		renderSignUpRoute();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Mara' },
		});
		fireEvent.change(screen.getByLabelText('Last name'), {
			target: { value: 'Okonkwo' },
		});
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'mara@northwind.co' },
		});
		fireEvent.change(screen.getByLabelText('Password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

		await waitFor(() =>
			expect(screen.getByTestId('signup-error-alert')).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('rejects an 11-character password client-side without calling register', async () => {
		mocks.signupsEnabled = true;

		renderSignUpRoute();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Mara' },
		});
		fireEvent.change(screen.getByLabelText('Last name'), {
			target: { value: 'Okonkwo' },
		});
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'mara@northwind.co' },
		});
		fireEvent.change(screen.getByLabelText('Password'), {
			target: { value: 'aurora-4417' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

		await waitFor(() =>
			expect(screen.getByText('Use at least 12 characters.')).toBeTruthy(),
		);
		expect(mocks.registerAndRequestEmailVerification).not.toHaveBeenCalled();
	});

	test('shows validation errors and does not submit when names are blank or whitespace-only', async () => {
		mocks.signupsEnabled = true;

		renderSignUpRoute();

		// Whitespace-only, not truly empty: the native `required` attribute
		// only rejects an empty string, so this is the case that only the
		// zod `.trim().min(1)` validation (not the browser) can catch.
		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: '   ' },
		});
		fireEvent.change(screen.getByLabelText('Last name'), {
			target: { value: '   ' },
		});
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'mara@northwind.co' },
		});
		fireEvent.change(screen.getByLabelText('Password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

		await waitFor(() =>
			expect(screen.getByText('First name is required')).toBeTruthy(),
		);
		expect(screen.getByText('Last name is required')).toBeTruthy();
		expect(mocks.registerAndRequestEmailVerification).not.toHaveBeenCalled();
	});

	test('maps a 422 password validation failure onto the password field', async () => {
		mocks.signupsEnabled = true;
		// The API's ValidationResult.ToDictionary() keys errors by the rule's
		// PascalCase PropertyName (ReqBodyValidationFilter.cs), never camelCase —
		// pin the real wire shape so this doesn't regress silently (r3-F2).
		mocks.registerAndRequestEmailVerification.mockRejectedValue({
			status: 422,
			errors: { Password: ['Password is too common.'] },
		});

		renderSignUpRoute();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Mara' },
		});
		fireEvent.change(screen.getByLabelText('Last name'), {
			target: { value: 'Okonkwo' },
		});
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'mara@northwind.co' },
		});
		fireEvent.change(screen.getByLabelText('Password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

		await waitFor(() =>
			expect(screen.getByText('Password is too common.')).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	test('maps a 422 email validation failure onto the email field, not the password field', async () => {
		mocks.signupsEnabled = true;
		mocks.registerAndRequestEmailVerification.mockRejectedValue({
			status: 422,
			errors: { Email: ['Email is already registered.'] },
		});

		renderSignUpRoute();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Mara' },
		});
		fireEvent.change(screen.getByLabelText('Last name'), {
			target: { value: 'Okonkwo' },
		});
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'mara@northwind.co' },
		});
		fireEvent.change(screen.getByLabelText('Password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

		await waitFor(() =>
			expect(screen.getByText('Email is already registered.')).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
