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
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	register: vi.fn(),
	requestEmailVerification: vi.fn(),
	guard: vi.fn(),
	signupsEnabled: false,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	useNavigate: () => mocks.navigate,
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

vi.mock('~/lib/server/auth-actions', () => ({
	register: mocks.register,
	requestEmailVerification: mocks.requestEmailVerification,
}));

vi.mock('~/lib/auth-route-guard', () => ({
	redirectAuthenticatedUserAwayFromAuthPage: mocks.guard,
}));

vi.mock('~/lib/flags', () => ({
	get FEATURES() {
		return { auth: { signupsEnabled: mocks.signupsEnabled } };
	},
}));

const EN_LABELS: Record<string, string> = {
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
	'n+ characters': '8+ characters',
	'create-account': 'Create account',
	'by-signing-up-agree': 'By signing up, I agree to',
	'terms-of-service': 'Terms of service',
	and: 'and',
	'privacy-policy': 'Privacy policy',
	'first-name-required': 'First name is required',
	'last-name-required': 'Last name is required',
	'enter-valid-email-address': 'Enter a valid email address.',
	'password-min-length-hint': 'Use at least 8 characters.',
	'an-error-occurred': 'An error occurred',
	'show-password': 'Show password',
	'hide-password': 'Hide password',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === 'n+ characters' && options?.characters) {
				return `${options.characters}+ characters`;
			}
			return EN_LABELS[key] ?? key;
		},
		i18n: { language: 'en' },
	}),
}));

import { redirectAuthenticatedUserAwayFromAuthPage } from '~/lib/auth-route-guard';

import { Route } from './signup';

const renderSignUpRoute = () => {
	const Component = (
		Route as unknown as { component: () => ReturnType<typeof createElement> }
	).component;
	return render(createElement(Component));
};

describe('signup route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.signupsEnabled = false;
	});

	afterEach(() => {
		cleanup();
	});

	test('attaches the authenticated-user redirect guard', () => {
		expect((Route as unknown as { beforeLoad: unknown }).beforeLoad).toBe(
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
		mocks.register.mockResolvedValue({
			id: 'user-1',
			email: 'mara@northwind.co',
		});
		mocks.requestEmailVerification.mockResolvedValue({ status: 'sent' });

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
			expect(mocks.register).toHaveBeenCalledWith({
				data: { email: 'mara@northwind.co', password: 'aurora-4417' },
			}),
		);
		await waitFor(() =>
			expect(mocks.requestEmailVerification).toHaveBeenCalledWith({
				data: { email: 'mara@northwind.co' },
			}),
		);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: '/verify-email',
				search: { email: 'mara@northwind.co' },
			}),
		);
	});

	test('shows an inline error and does not navigate when register fails', async () => {
		mocks.signupsEnabled = true;
		mocks.register.mockRejectedValue({ status: 400 });

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
			expect(screen.getByTestId('signup-error-alert')).toBeTruthy(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
