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

type ResetPasswordLoaderData =
	| { view: 'invalid' }
	| { view: 'request' }
	| {
			view: 'set-new';
			id: string;
			token: string;
			email: string;
			fromEmailVerification: boolean;
	  };

const mocks = vi.hoisted(() => ({
	loaderData: { view: 'request' } as ResetPasswordLoaderData,
	checkResetPasswordToken: vi.fn(),
	requestEmailVerification: vi.fn(),
	requestPasswordReset: vi.fn(),
	resetPassword: vi.fn(),
	guard: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	useLoaderData: () => mocks.loaderData,
	Link: ({
		children,
		to,
		search,
		...props
	}: {
		children: ReactNode;
		to: string;
		search?: Record<string, string>;
	}) => {
		const query = search ? `?${new URLSearchParams(search).toString()}` : '';
		return createElement('a', { href: `${to}${query}`, ...props }, children);
	},
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

vi.mock('~/lib/server/auth-actions', () => ({
	checkResetPasswordToken: mocks.checkResetPasswordToken,
	requestEmailVerification: mocks.requestEmailVerification,
	requestPasswordReset: mocks.requestPasswordReset,
	resetPassword: mocks.resetPassword,
}));

vi.mock('~/lib/auth-route-guard', () => ({
	redirectAuthenticatedUserAwayFromAuthPage: mocks.guard,
}));

const EN_LABELS: TestLabelMap = {
	'reset-your-password': 'Reset your password',
	'reset-password-request-description':
		"Enter your account email and we'll send a link to set a new password.",
	'send-reset-link': 'Send reset link',
	'back-to-sign-in': 'Back to sign in',
	'email-address': 'Email address',
	'email-placeholder': 'name@company.com',
	'reset-link-sent-title': 'Reset link sent',
	'reset-link-sent-description':
		"<strong>{{email}}</strong> is valid, you'll receive an email with a link to reset your password.",
	'go-to-home': 'Go to home',
	'set-a-new-password': 'Set a new password',
	'reset-password-description':
		'Enter your new password for <strong>{{email}}</strong>',
	'email-verification-success': 'Email verification successful',
	'new-password': 'New password',
	'confirm-password': 'Confirm password',
	'password-min-length-hint': 'Use at least 8 characters.',
	'password-min-length-hint-n': 'Use at least {{characters}} characters.',
	'reset-password': 'Reset password',
	'password-reset-title': 'Password reset',
	'password-reset-success-description':
		'Your password has been updated. You can now sign in with your new password.',
	'invalid-link-title': 'This link is invalid or expired',
	'invalid-reset-link-description':
		"The password reset link you issued is invalid or expired. Request a fresh one and we'll email it right over.",
	'request-a-new-link': 'Request a new link',
	'back-to-login': 'Back to login',
	'enter-valid-email-address': 'Enter a valid email address.',
	'passwords-do-not-match': 'Passwords do not match',
	'password-is-required': 'Password is required.',
	'an-error-occurred': 'An error occurred',
	'show-password': 'Show password',
	'hide-password': 'Hide password',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const resolvedKey = key.replace(/^common:/, '');
			return EN_LABELS[resolvedKey] ?? resolvedKey;
		},
		i18n: { language: 'en' },
	}),
	Trans: ({
		i18nKey,
		values,
	}: {
		i18nKey: string;
		values?: Record<string, string>;
	}) => {
		let text = EN_LABELS[i18nKey] ?? i18nKey;
		for (const [key, value] of Object.entries(values ?? {})) {
			text = text.replaceAll(`{{${key}}}`, value);
		}
		return text.replace(/<\/?strong>/g, '');
	},
}));

import { redirectAuthenticatedUserAwayFromAuthPage } from '~/lib/auth-route-guard';

import { Route } from './reset-password';

const renderResetPasswordRoute = () => {
	const Component = Route.options.component as () => ReturnType<
		typeof createElement
	>;
	return render(createElement(Component));
};

describe('reset-password route', () => {
	test('declares the auth i18n namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual(['auth']);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loaderData = { view: 'request' };
	});

	afterEach(() => {
		cleanup();
	});

	test('attaches the authenticated-user redirect guard', () => {
		expect((Route.options as { beforeLoad: unknown }).beforeLoad).toBe(
			redirectAuthenticatedUserAwayFromAuthPage,
		);
	});

	test('renders the request form when there is no token', () => {
		renderResetPasswordRoute();

		expect(
			screen.getByRole('heading', { level: 1, name: 'Reset your password' }),
		).toBeTruthy();
		expect(screen.getByLabelText('Email address')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Send reset link' }),
		).toBeTruthy();
	});

	test('submits the request form and shows the sent confirmation', async () => {
		mocks.requestPasswordReset.mockResolvedValue({ status: 'sent' });

		renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'rui@latticecloud.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

		await waitFor(() =>
			expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
				data: { email: 'rui@latticecloud.com' },
			}),
		);
		expect(screen.getByTestId('reset-password-request-sent')).toBeTruthy();
	});

	test('never calls requestEmailVerification from the forgot-password form', async () => {
		mocks.requestPasswordReset.mockResolvedValue({ status: 'sent' });

		renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'rui@latticecloud.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

		await waitFor(() => expect(mocks.requestPasswordReset).toHaveBeenCalled());
		expect(mocks.requestEmailVerification).not.toHaveBeenCalled();
	});

	test('still calls the password-reset action (not requestEmailVerification) when the call rejects', async () => {
		mocks.requestPasswordReset.mockRejectedValue(new Error('boom'));

		renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'rui@latticecloud.com' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

		await waitFor(() =>
			expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
				data: { email: 'rui@latticecloud.com' },
			}),
		);
		expect(mocks.requestEmailVerification).not.toHaveBeenCalled();
	});

	test('renders the set-new-password form for a valid token, with the email-verified banner', () => {
		mocks.loaderData = {
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: true,
		};

		renderResetPasswordRoute();

		expect(
			screen.getByRole('heading', { level: 1, name: 'Set a new password' }),
		).toBeTruthy();
		expect(
			screen.getByTestId('reset-password-email-verified-alert'),
		).toBeTruthy();
		expect(screen.getByLabelText('New password')).toBeTruthy();
		expect(screen.getByLabelText('Confirm password')).toBeTruthy();
	});

	test('omits the email-verified banner when not arriving from email verification', () => {
		mocks.loaderData = {
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: false,
		};

		renderResetPasswordRoute();

		expect(
			screen.queryByTestId('reset-password-email-verified-alert'),
		).toBeNull();
	});

	test('submits the set-new-password form and shows the success screen', async () => {
		mocks.loaderData = {
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: false,
		};
		mocks.resetPassword.mockResolvedValue({ status: 'success' });

		renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('New password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.change(screen.getByLabelText('Confirm password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

		await waitFor(() =>
			expect(mocks.resetPassword).toHaveBeenCalledWith({
				data: {
					id: 'enc-id',
					token: 'tok',
					newPassword: 'aurora-441789',
					confirmPassword: 'aurora-441789',
				},
			}),
		);
		expect(screen.getByTestId('reset-password-success')).toBeTruthy();
	});

	test("the success screen's sign-in link carries rc=password_reset_success so /login can show the banner", async () => {
		mocks.loaderData = {
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: false,
		};
		mocks.resetPassword.mockResolvedValue({ status: 'success' });

		renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('New password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.change(screen.getByLabelText('Confirm password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

		await waitFor(() =>
			expect(screen.getByTestId('reset-password-success')).toBeTruthy(),
		);
		const signInLink = screen.getByRole('link', { name: 'Back to sign in' });
		expect(signInLink.getAttribute('href')).toBe(
			'/login?rc=password_reset_success',
		);
	});

	test('rejects an 11-character password client-side without calling the server fn', async () => {
		mocks.loaderData = {
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: false,
		};

		renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('New password'), {
			target: { value: 'aurora-4417' },
		});
		fireEvent.change(screen.getByLabelText('Confirm password'), {
			target: { value: 'aurora-4417' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

		await waitFor(() =>
			expect(
				screen.getByLabelText('New password').getAttribute('aria-invalid'),
			).toBe('true'),
		);
		expect(mocks.resetPassword).not.toHaveBeenCalled();
	});

	test('falls back to the invalid-link view when the token is rejected mid-submit', async () => {
		mocks.loaderData = {
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: false,
		};
		mocks.resetPassword.mockRejectedValue({ status: 400 });

		renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('New password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.change(screen.getByLabelText('Confirm password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

		await waitFor(() =>
			expect(
				screen.getByTestId('reset-password-invalid-link-view'),
			).toBeTruthy(),
		);
	});

	test('maps a 422 new-password validation failure onto the new-password field using the API PascalCase key', async () => {
		// ValidationResult.ToDictionary() (ReqBodyValidationFilter.cs) keys 422
		// errors by PascalCase PropertyName (`NewPassword`), never camelCase (r3-F2).
		mocks.loaderData = {
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: false,
		};
		mocks.resetPassword.mockRejectedValue({
			status: 422,
			errors: { NewPassword: ['This password has been compromised.'] },
		});

		renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('New password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.change(screen.getByLabelText('Confirm password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

		await waitFor(() =>
			expect(
				screen.getByText('This password has been compromised.'),
			).toBeTruthy(),
		);
		expect(screen.queryByTestId('reset-password-success')).toBeNull();
	});

	test('clicking "Request a new link" after a mid-submit rejection reaches the request form once the loader re-runs', async () => {
		mocks.loaderData = {
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: false,
		};
		mocks.resetPassword.mockRejectedValue({ status: 400 });

		const { rerender } = renderResetPasswordRoute();
		fireEvent.change(screen.getByLabelText('New password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.change(screen.getByLabelText('Confirm password'), {
			target: { value: 'aurora-441789' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

		await waitFor(() =>
			expect(
				screen.getByTestId('reset-password-invalid-link-view'),
			).toBeTruthy(),
		);

		// Simulate the "Request a new link" same-route navigation: the URL
		// loses its id/token, so the loader re-runs and returns the request
		// view — a fresh object, which is what the component keys its
		// tokenRejected reset off of.
		mocks.loaderData = { view: 'request' };
		const Component = Route.options.component as () => ReturnType<
			typeof createElement
		>;
		rerender(createElement(Component));

		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Send reset link' }),
			).toBeTruthy(),
		);
	});

	test('renders the shared invalid-link view when the loader reports an invalid token', () => {
		mocks.loaderData = { view: 'invalid' };

		renderResetPasswordRoute();

		expect(screen.getByTestId('reset-password-invalid-link-view')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Request a new link' }),
		).toHaveProperty('href', expect.stringContaining('/reset-password'));
	});
});

describe('reset-password loader', () => {
	type ResetPasswordLoaderResult = { view: 'request' } | { view: 'invalid' };

	const loader = (
		Route.options as {
			loader: (args: {
				location: { searchStr: string };
			}) => Promise<ResetPasswordLoaderResult>;
		}
	).loader;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('returns the request view when there is no token', async () => {
		await expect(loader({ location: { searchStr: '' } })).resolves.toEqual({
			view: 'request',
		});
	});

	test('returns the invalid view when the token check fails', async () => {
		mocks.checkResetPasswordToken.mockResolvedValue({ ok: false });

		await expect(
			loader({ location: { searchStr: '?id=enc-id&token=tok' } }),
		).resolves.toEqual({ view: 'invalid' });
	});

	test('returns the set-new view, flagging the email-verification banner', async () => {
		mocks.checkResetPasswordToken.mockResolvedValue({
			ok: true,
			email: 'rui@latticecloud.com',
		});

		await expect(
			loader({
				location: { searchStr: '?id=enc-id&token=tok&rc=email_verification' },
			}),
		).resolves.toEqual({
			view: 'set-new',
			id: 'enc-id',
			token: 'tok',
			email: 'rui@latticecloud.com',
			fromEmailVerification: true,
		});
	});
});
