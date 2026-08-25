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

type VerifyEmailLoaderData =
	| { view: 'invalid' }
	| { view: 'sent'; email: string }
	| { view: 'request' };

const mocks = vi.hoisted(() => ({
	loaderData: { view: 'request' } as VerifyEmailLoaderData,
	redirect: vi.fn((opts: Record<string, unknown>) => ({
		isRedirect: true,
		...opts,
	})),
	checkEmailVerificationToken: vi.fn(),
	requestEmailVerification: vi.fn(),
	guard: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	useLoaderData: () => mocks.loaderData,
	redirect: mocks.redirect,
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

vi.mock('~/lib/server/auth-actions', () => ({
	checkEmailVerificationToken: mocks.checkEmailVerificationToken,
	requestEmailVerification: mocks.requestEmailVerification,
}));

vi.mock('~/lib/auth-route-guard', () => ({
	redirectAuthenticatedUserAwayFromAuthPage: mocks.guard,
}));

const EN_LABELS: Record<string, string> = {
	'verify-your-email': 'Verify your email',
	'verify-your-email-description':
		"Enter your account email and we'll send you a fresh verification link.",
	'back-to-sign-in': 'Back to sign in',
	'email-address': 'Email address',
	'email-placeholder': 'name@company.com',
	'verify-email': 'Verify email',
	'verification-email-sent': 'Verification email sent',
	'verify-email-sent-description':
		"<strong>{{email}}</strong> is valid, you'll receive an email with a link to verify your account.",
	'verify-email-sent-hint':
		"Didn't get it? Check your spam folder, or try again in a minute.",
	'go-to-home': 'Go to home',
	'invalid-link-title': 'This link is invalid or expired',
	'invalid-verification-link-description':
		"The verification link you issued is invalid or expired. Request a fresh one and we'll email it right over.",
	'request-a-new-link': 'Request a new link',
	'back-to-login': 'Back to login',
	'enter-valid-email-address': 'Enter a valid email address.',
	'an-error-occurred': 'An error occurred',
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
import { buildSafeResetPasswordHref } from '~/lib/build-safe-reset-password-href';

import { Route } from './verify-email';

const renderVerifyEmailRoute = () => {
	const Component = Route.options.component as () => ReturnType<
		typeof createElement
	>;
	return render(createElement(Component));
};

describe('verify-email route', () => {
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

	test('renders the request form by default', () => {
		renderVerifyEmailRoute();

		expect(
			screen.getByRole('heading', { level: 1, name: 'Verify your email' }),
		).toBeTruthy();
		expect(screen.getByLabelText('Email address')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Verify email' })).toBeTruthy();
		expect(
			screen.getByRole('link', { name: /Back to sign in/ }),
		).toHaveProperty('href', expect.stringContaining('/login'));
	});

	test('submits the request form and flips to the sent confirmation', async () => {
		mocks.requestEmailVerification.mockResolvedValue({ status: 'sent' });

		renderVerifyEmailRoute();
		fireEvent.change(screen.getByLabelText('Email address'), {
			target: { value: 'alex@brightwave.io' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

		await waitFor(() =>
			expect(mocks.requestEmailVerification).toHaveBeenCalledWith({
				data: { email: 'alex@brightwave.io' },
			}),
		);
		expect(screen.getByTestId('verify-email-sent')).toBeTruthy();
		expect(
			screen.getByText(
				"alex@brightwave.io is valid, you'll receive an email with a link to verify your account.",
			),
		).toBeTruthy();
	});

	test('renders the sent state directly when loader data arrives from a signup redirect', () => {
		mocks.loaderData = { view: 'sent', email: 'mara@northwind.co' };

		renderVerifyEmailRoute();

		expect(screen.getByTestId('verify-email-sent')).toBeTruthy();
		expect(screen.getByText(/mara@northwind\.co/)).toBeTruthy();
	});

	test('a same-route navigation away from a loader-derived sent view reaches the request form', async () => {
		mocks.loaderData = { view: 'sent', email: 'mara@northwind.co' };

		const { rerender } = renderVerifyEmailRoute();
		expect(screen.getByTestId('verify-email-sent')).toBeTruthy();

		// Simulate navigating back to bare /verify-email: the loader re-runs
		// and returns the request view — a fresh object, which is what the
		// component keys its locally-submitted-email reset off of.
		mocks.loaderData = { view: 'request' };
		const Component = Route.options.component as () => ReturnType<
			typeof createElement
		>;
		rerender(createElement(Component));

		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Verify email' })).toBeTruthy(),
		);
		expect(screen.queryByTestId('verify-email-sent')).toBeNull();
	});

	test('renders the shared invalid-link view when the token is invalid', () => {
		mocks.loaderData = { view: 'invalid' };

		renderVerifyEmailRoute();

		expect(screen.getByTestId('verify-email-invalid-link-view')).toBeTruthy();
		expect(
			screen.getByRole('heading', { name: 'This link is invalid or expired' }),
		).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Request a new link' }),
		).toHaveProperty('href', expect.stringContaining('/verify-email'));
	});
});

describe('verify-email loader', () => {
	type VerifyEmailLoaderResult =
		| { view: 'request' }
		| { view: 'sent'; email: string }
		| { view: 'invalid' };

	const loader = (
		Route.options as {
			loader: (args: {
				location: { searchStr: string };
			}) => Promise<VerifyEmailLoaderResult>;
		}
	).loader;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('returns the request view when there is no token or email', async () => {
		await expect(loader({ location: { searchStr: '' } })).resolves.toEqual({
			view: 'request',
		});
	});

	test('returns the sent view when a signup redirect email is present', async () => {
		await expect(
			loader({ location: { searchStr: '?email=mara%40northwind.co' } }),
		).resolves.toEqual({ view: 'sent', email: 'mara@northwind.co' });
	});

	test('returns the invalid view when the token check fails', async () => {
		mocks.checkEmailVerificationToken.mockResolvedValue({ ok: false });

		await expect(
			loader({ location: { searchStr: '?id=enc-id&token=tok' } }),
		).resolves.toEqual({ view: 'invalid' });
	});

	test('redirects to the safe reset-password href when the token is valid', async () => {
		mocks.checkEmailVerificationToken.mockResolvedValue({
			ok: true,
			resetPasswordUrl:
				'https://app.publyapp.com/reset-password?id=enc-id&token=tok',
		});

		await expect(
			loader({ location: { searchStr: '?id=enc-id&token=tok' } }),
		).rejects.toEqual(
			expect.objectContaining({
				isRedirect: true,
				href: '/reset-password?id=enc-id&token=tok&rc=email_verification',
				replace: true,
				reloadDocument: true,
			}),
		);
	});
});

describe('buildSafeResetPasswordHref', () => {
	test('falls back to /reset-password when the url is missing', () => {
		expect(buildSafeResetPasswordHref(undefined)).toBe('/reset-password');
	});

	test('falls back to /reset-password when the url cannot be parsed', () => {
		expect(buildSafeResetPasswordHref('not a url')).toBe('/reset-password');
	});

	test('falls back to /reset-password when id or token is missing', () => {
		expect(
			buildSafeResetPasswordHref(
				'https://app.publyapp.com/reset-password?id=only-id',
			),
		).toBe('/reset-password');
	});

	test('rebuilds the path from id/token only, ignoring the response host', () => {
		expect(
			buildSafeResetPasswordHref(
				'https://attacker.example/reset-password?id=enc-id&token=tok',
			),
		).toBe('/reset-password?id=enc-id&token=tok&rc=email_verification');
	});
});
