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

type InvitationLoaderData =
	| { view: 'invalid' }
	| {
			view: 'valid';
			token: string;
			email: string;
			profileName: string;
			userExists: boolean;
	  };

const VALID_LOADER_DATA: InvitationLoaderData = {
	view: 'valid',
	token: 'tok',
	email: 'jordan@latticecloud.com',
	profileName: 'Editor',
	userExists: false,
};
/** Problem payload shape the suite feeds `currentUserQuery.error`; the
 * route pipes it through `toApiFailure`. */
type CurrentUserLookupProblem = { status: number; detail?: string };

type CurrentUserQueryState = {
	isSuccess: boolean;
	isError: boolean;
	error?: CurrentUserLookupProblem;
	data?: { email?: string };
	isFetching?: boolean;
	refetch?: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
	loaderData: { view: 'invalid' } as InvitationLoaderData,
	navigate: vi.fn(),
	pathname: '/accept-invitation',
	searchStr: '?id=enc-id&token=tok',
	loadInvitationInfo: vi.fn(),
	acceptInvitation: vi.fn(),
	completeLoginRedirect: vi.fn(),
	postBroadcast: vi.fn(),
	hasBrowserSessionCookie: vi.fn(),
	currentUserQueryRefetch: vi.fn(),
	currentUserQuery: {
		isSuccess: false,
		isError: false,
		data: undefined as { email?: string } | undefined,
	} as CurrentUserQueryState,
	logout: vi.fn(),
	isLoggingOut: false,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	useLoaderData: () => mocks.loaderData,
	useLocation: () => ({
		pathname: mocks.pathname,
		searchStr: mocks.searchStr,
	}),
	useNavigate: () => mocks.navigate,
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

vi.mock('~/lib/server/invitation-actions', () => ({
	loadInvitationInfo: mocks.loadInvitationInfo,
	acceptInvitation: mocks.acceptInvitation,
}));

vi.mock('~/lib/server/session-actions', () => ({
	completeLoginRedirect: mocks.completeLoginRedirect,
}));

vi.mock('~/lib/tab-sync/broadcast-sync', () => ({
	AUTH_SYNC_CHANNEL: 'publyapp:auth-sync',
	postBroadcast: mocks.postBroadcast,
}));

vi.mock('~/lib/auth-route-guard', () => ({
	hasBrowserSessionCookie: mocks.hasBrowserSessionCookie,
}));

vi.mock('~/lib/query/auth', () => ({
	useCurrentUserQuery: () => ({
		isFetching: false,
		refetch: mocks.currentUserQueryRefetch,
		...mocks.currentUserQuery,
	}),
}));

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({
		logout: mocks.logout,
		isLoggingOut: mocks.isLoggingOut,
	}),
}));

const EN_LABELS: TestLabelMap = {
	'invited-email': 'Invited email',
	profile: 'Profile',
	'common-loading': 'Loading...',
	'create-your-account': 'Create your account',
	'accept-invitation-new-user-description':
		'Set a name and password to join as {{role}}.',
	'auth-first-name': 'First name',
	'auth-last-name': 'Last name',
	password: 'Password',
	'confirm-password': 'Confirm password',
	'create-account': 'Create account',
	'first-name-required': 'First name is required',
	'last-name-required': 'Last name is required',
	'password-min-length-hint-n': 'Use at least {{characters}} characters.',
	'passwords-do-not-match': 'Passwords do not match',
	'accept-invitation-title': 'Accept your invitation',
	'auth-invitation-existing-user-authenticated-description':
		'This email already has an account. Join this organization with your current account.',
	'auth-invitation-existing-user-login-description':
		'This email already has an account. Sign in first, then continue with this invitation.',
	'signed-in-as': 'Signed in as',
	'join-organization': 'Join organization',
	'accept-invitation-not-you': 'Not you? Use a different account',
	'sign-in-to-continue': 'Sign in to continue',
	'accept-invitation-return-note':
		"You'll return to this invitation, with {{email}} pre-filled.",
	'auth-invitation-wrong-account-title': 'Wrong account',
	'auth-invitation-log-out-and-sign-in': 'Log out and sign in',
	'auth-invitation-log-out-and-continue': 'Log out and continue',
	'auth-invitation-invalid': 'Invalid Invitation',
	'auth-invitation-invalid-description':
		'This invitation link is invalid or has expired.',
	'back-to-login': 'Back to login',
	'an-error-occurred': 'An error occurred',
	'show-password': 'Show password',
	'hide-password': 'Hide password',
	'accept-invitation-brand-eyebrow': "You're invited",
	'accept-invitation-brand-headline-new-user':
		'Join your team and start shipping social from day one.',
	'accept-invitation-brand-subtitle-new-user':
		"Set up your account and your workspace opens the moment you're in.",
	'accept-invitation-brand-headline-existing-match':
		'One more organization, added to your account.',
	'accept-invitation-brand-subtitle-existing-match':
		'Accept and it shows up right alongside your other workspaces.',
	'accept-invitation-brand-headline-existing-signed-out':
		'Sign in, and the invitation picks up where it left off.',
	'accept-invitation-brand-subtitle-existing-signed-out':
		"We'll bring you straight back here once you're signed in.",
	'accept-invitation-brand-headline-mismatch':
		'This invite belongs to a different account.',
	'accept-invitation-brand-subtitle-mismatch':
		"Switch to the invited email and you'll be right back here to join.",
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, string>) => {
			// Keys may arrive namespace-qualified (`auth:some-key`) — lookup
			// tables in _accept-invitation-i18n-keys.ts qualify their values.
			const resolvedKey = key.replace(/^[a-z][a-z0-9]*:/, '');
			let text = EN_LABELS[resolvedKey] ?? resolvedKey;
			for (const [name, value] of Object.entries(values ?? {})) {
				text = text.replaceAll(`{{${name}}}`, value);
			}
			return text;
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

import { Route } from './accept-invitation';

const getRouteComponent = () =>
	Route.options.component as () => ReturnType<typeof createElement>;

const renderAcceptInvitationRoute = () =>
	render(createElement(getRouteComponent()));

describe('accept-invitation route', () => {
	test('declares the auth i18n namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual(['auth']);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loaderData = { ...VALID_LOADER_DATA };
		mocks.hasBrowserSessionCookie.mockReturnValue(false);
		mocks.currentUserQuery = {
			isSuccess: false,
			isError: false,
			data: undefined,
		};
		mocks.currentUserQueryRefetch.mockReset();
		mocks.isLoggingOut = false;
		mocks.completeLoginRedirect.mockResolvedValue({ targetPath: '/tenant' });
	});

	afterEach(() => {
		cleanup();
	});

	describe('branch selection', () => {
		test('renders the shared invalid-link view when the loader reports an invalid token', () => {
			mocks.loaderData = { view: 'invalid' };

			renderAcceptInvitationRoute();

			expect(
				screen.getByTestId('accept-invitation-invalid-link-view'),
			).toBeTruthy();
			expect(
				screen.getByRole('heading', { name: 'Invalid Invitation' }),
			).toBeTruthy();
		});

		test('renders the new-user registration form when signed out and no account exists yet', () => {
			mocks.loaderData = { ...VALID_LOADER_DATA, userExists: false };
			mocks.hasBrowserSessionCookie.mockReturnValue(false);

			renderAcceptInvitationRoute();

			expect(screen.getByTestId('accept-invitation-new-user')).toBeTruthy();
		});

		test('renders the sign-in CTA when signed out and an account already exists', () => {
			mocks.loaderData = { ...VALID_LOADER_DATA, userExists: true };
			mocks.hasBrowserSessionCookie.mockReturnValue(false);
			mocks.pathname = '/accept-invitation';
			mocks.searchStr = '?id=enc-id&token=tok';

			renderAcceptInvitationRoute();

			expect(
				screen.getByTestId('accept-invitation-existing-signed-out'),
			).toBeTruthy();

			// F4: the sign-in CTA must carry the invitation's own path (so
			// login can return here) and the invited email (so the user
			// doesn't have to retype it) — a real <Link>, not a raw <a> that
			// would tear down the SPA.
			const signInLink = screen.getByRole('link', {
				name: 'Sign in to continue',
			});
			const href = signInLink.getAttribute('href') ?? '';
			expect(href.startsWith('/login?')).toBe(true);
			const params = new URLSearchParams(href.split('?')[1]);
			expect(params.get('rto')).toBe('/accept-invitation?id=enc-id&token=tok');
			expect(params.get('email')).toBe(VALID_LOADER_DATA.email);
		});

		test('renders the loading state while the current-user query is still resolving', () => {
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: false,
				isError: false,
				data: undefined,
			};

			renderAcceptInvitationRoute();

			expect(screen.getByTestId('accept-invitation-loading')).toBeTruthy();
		});

		test('renders the matched-account view when signed in with the invited email', () => {
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: true,
				isError: false,
				data: { email: 'Jordan@LatticeCloud.com' },
			};

			renderAcceptInvitationRoute();

			expect(
				screen.getByTestId('accept-invitation-existing-match'),
			).toBeTruthy();
		});

		test('renders the wrong-account view when signed in with a different email', () => {
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: true,
				isError: false,
				data: { email: 'rui@northwind.co' },
			};

			renderAcceptInvitationRoute();

			expect(screen.getByTestId('accept-invitation-mismatch')).toBeTruthy();
		});

		test('treats a failed current-user lookup (stale/invalid cookie) as signed out', () => {
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: false,
				isError: true,
				error: { status: 401 },
				data: undefined,
			};

			renderAcceptInvitationRoute();

			expect(screen.getByTestId('accept-invitation-new-user')).toBeTruthy();
		});

		test('renders the auth-lookup error screen for non-401 lookup failures', () => {
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: false,
				isError: true,
				error: { status: 500, detail: 'Session service unavailable' },
				data: undefined,
			};

			renderAcceptInvitationRoute();

			expect(
				screen.getByTestId('accept-invitation-auth-lookup-error'),
			).toBeTruthy();
			expect(screen.getByText('Session service unavailable')).toBeTruthy();
			expect(screen.getByRole('button', { name: 'try-again' })).toBeTruthy();
		});

		test('retrying an auth-lookup error refetches the current-user query instead of reloading the document', () => {
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: false,
				isError: true,
				error: { status: 500, detail: 'Session service unavailable' },
				data: undefined,
			};
			const reloadSpy = vi.fn();
			const originalLocation = window.location;
			Object.defineProperty(window, 'location', {
				configurable: true,
				value: { ...originalLocation, reload: reloadSpy },
			});

			try {
				renderAcceptInvitationRoute();

				fireEvent.click(screen.getByRole('button', { name: 'try-again' }));

				expect(mocks.currentUserQueryRefetch).toHaveBeenCalledTimes(1);
				expect(reloadSpy).not.toHaveBeenCalled();
			} finally {
				Object.defineProperty(window, 'location', {
					configurable: true,
					value: originalLocation,
				});
			}
		});
	});

	describe('accept payload shapes and session establishment', () => {
		test('submits the new-user form with useExistingAccount omitted, then signs in like login does', async () => {
			mocks.loaderData = { ...VALID_LOADER_DATA, userExists: false };
			mocks.hasBrowserSessionCookie.mockReturnValue(false);
			mocks.acceptInvitation.mockResolvedValue({
				sessionExpiresAt: '2026-01-01T00:00:00.000Z',
			});

			renderAcceptInvitationRoute();

			fireEvent.change(screen.getByLabelText('First name'), {
				target: { value: 'Jordan' },
			});
			fireEvent.change(screen.getByLabelText('Last name'), {
				target: { value: 'Reyes' },
			});
			fireEvent.change(screen.getByLabelText('Password'), {
				target: { value: 'correct-horse-battery' },
			});
			fireEvent.change(screen.getByLabelText('Confirm password'), {
				target: { value: 'correct-horse-battery' },
			});
			fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

			await waitFor(() =>
				expect(mocks.acceptInvitation).toHaveBeenCalledWith({
					data: {
						token: 'tok',
						mode: 'new-user',
						firstName: 'Jordan',
						lastName: 'Reyes',
						password: 'correct-horse-battery',
					},
				}),
			);

			await waitFor(() =>
				expect(mocks.completeLoginRedirect).toHaveBeenCalledWith({
					data: { sessionExpiresAt: '2026-01-01T00:00:00.000Z' },
				}),
			);
			expect(mocks.postBroadcast).toHaveBeenCalledWith('publyapp:auth-sync', {
				type: 'login',
			});
			// Navigation is deferred one commit (redirect target committed in
			// the submit hook, performed by an effect), so wait for it.
			await waitFor(() =>
				expect(mocks.navigate).toHaveBeenCalledWith({
					to: '/tenant',
					replace: true,
				}),
			);
		});

		test('retries redirect only after a successful acceptance, never double-calling accept', async () => {
			mocks.loaderData = { ...VALID_LOADER_DATA, userExists: false };
			mocks.hasBrowserSessionCookie.mockReturnValue(false);
			mocks.acceptInvitation.mockResolvedValue({
				sessionExpiresAt: '2026-01-01T00:00:00.000Z',
			});
			mocks.completeLoginRedirect
				.mockRejectedValueOnce({ status: 500, detail: 'Temporary outage' })
				.mockResolvedValue({ targetPath: '/tenant' });

			renderAcceptInvitationRoute();

			fireEvent.change(screen.getByLabelText('First name'), {
				target: { value: 'Jordan' },
			});
			fireEvent.change(screen.getByLabelText('Last name'), {
				target: { value: 'Reyes' },
			});
			fireEvent.change(screen.getByLabelText('Password'), {
				target: { value: 'correct-horse-battery' },
			});
			fireEvent.change(screen.getByLabelText('Confirm password'), {
				target: { value: 'correct-horse-battery' },
			});
			fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

			await waitFor(() =>
				expect(mocks.acceptInvitation).toHaveBeenCalledWith({
					data: {
						token: 'tok',
						mode: 'new-user',
						firstName: 'Jordan',
						lastName: 'Reyes',
						password: 'correct-horse-battery',
					},
				}),
			);
			await waitFor(() =>
				expect(mocks.completeLoginRedirect).toHaveBeenCalledWith({
					data: { sessionExpiresAt: '2026-01-01T00:00:00.000Z' },
				}),
			);
			expect(screen.getByTestId('accept-invitation-error-alert')).toBeTruthy();

			fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

			await waitFor(() =>
				expect(mocks.completeLoginRedirect).toHaveBeenCalledTimes(2),
			);
			expect(mocks.acceptInvitation).toHaveBeenCalledTimes(1);
			expect(mocks.postBroadcast).toHaveBeenCalledTimes(1);
			// Navigation is deferred one commit (redirect target committed in
			// the submit hook, performed by an effect), so wait for it.
			await waitFor(() =>
				expect(mocks.navigate).toHaveBeenCalledWith({
					to: '/tenant',
					replace: true,
				}),
			);
		});

		test('preserves the committed acceptance across an auth-state transition from new-user to existing-match, and retry completes without re-accepting (r5-F2)', async () => {
			mocks.loaderData = { ...VALID_LOADER_DATA, userExists: false };
			mocks.hasBrowserSessionCookie.mockReturnValue(false);
			mocks.acceptInvitation.mockResolvedValue({
				sessionExpiresAt: '2026-01-01T00:00:00.000Z',
			});
			mocks.completeLoginRedirect.mockRejectedValueOnce({
				status: 500,
				detail: 'Temporary outage',
			});

			const rendered = renderAcceptInvitationRoute();

			fireEvent.change(screen.getByLabelText('First name'), {
				target: { value: 'Jordan' },
			});
			fireEvent.change(screen.getByLabelText('Last name'), {
				target: { value: 'Reyes' },
			});
			fireEvent.change(screen.getByLabelText('Password'), {
				target: { value: 'correct-horse-battery' },
			});
			fireEvent.change(screen.getByLabelText('Confirm password'), {
				target: { value: 'correct-horse-battery' },
			});
			fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

			await waitFor(() =>
				expect(mocks.acceptInvitation).toHaveBeenCalledTimes(1),
			);
			await waitFor(() =>
				expect(
					screen.getByTestId('accept-invitation-error-alert'),
				).toBeTruthy(),
			);

			// The server already committed the session cookie before the
			// redirect-completion step transiently failed. On the next render the
			// browser session cookie is present and the current-user lookup
			// matches the invited email — this swaps the rendered branch from
			// new-user to existing-match, unmounting NewUserForm entirely.
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: true,
				isError: false,
				data: { email: VALID_LOADER_DATA.email },
			};
			mocks.completeLoginRedirect.mockResolvedValue({ targetPath: '/tenant' });
			rendered.rerender(createElement(getRouteComponent()));

			await waitFor(() =>
				expect(
					screen.getByTestId('accept-invitation-existing-match'),
				).toBeTruthy(),
			);

			fireEvent.click(
				screen.getByRole('button', { name: 'Join organization' }),
			);

			await waitFor(() =>
				expect(mocks.completeLoginRedirect).toHaveBeenCalledTimes(2),
			);
			// The accepted result from the first (new-user) attempt survived the
			// branch swap — the retry must not call acceptInvitation again.
			expect(mocks.acceptInvitation).toHaveBeenCalledTimes(1);
			expect(mocks.postBroadcast).toHaveBeenCalledTimes(1);
			// Navigation is deferred one commit (redirect target committed in
			// the submit hook, performed by an effect), so wait for it.
			await waitFor(() =>
				expect(mocks.navigate).toHaveBeenCalledWith({
					to: '/tenant',
					replace: true,
				}),
			);
		});

		test('joins with the existing account (useExistingAccount=true) when clicking "Join organization"', async () => {
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: true,
				isError: false,
				data: { email: 'jordan@latticecloud.com' },
			};
			mocks.acceptInvitation.mockResolvedValue({
				sessionExpiresAt: '2026-01-01T00:00:00.000Z',
			});

			renderAcceptInvitationRoute();
			fireEvent.click(
				screen.getByRole('button', { name: 'Join organization' }),
			);

			await waitFor(() =>
				expect(mocks.acceptInvitation).toHaveBeenCalledWith({
					data: { token: 'tok', mode: 'existing-account' },
				}),
			);
			await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
			expect(mocks.postBroadcast).toHaveBeenCalledWith('publyapp:auth-sync', {
				type: 'login',
			});
		});

		test('surfaces the failure message and does not broadcast a login on a rejected accept', async () => {
			mocks.loaderData = { ...VALID_LOADER_DATA, userExists: false };
			mocks.hasBrowserSessionCookie.mockReturnValue(false);
			mocks.acceptInvitation.mockRejectedValue({
				status: 400,
				title: 'Bad Request',
				detail: 'User already exists',
			});

			renderAcceptInvitationRoute();
			fireEvent.change(screen.getByLabelText('First name'), {
				target: { value: 'Jordan' },
			});
			fireEvent.change(screen.getByLabelText('Last name'), {
				target: { value: 'Reyes' },
			});
			fireEvent.change(screen.getByLabelText('Password'), {
				target: { value: 'correct-horse-battery' },
			});
			fireEvent.change(screen.getByLabelText('Confirm password'), {
				target: { value: 'correct-horse-battery' },
			});
			fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

			await waitFor(() =>
				expect(
					screen.getByTestId('accept-invitation-error-alert'),
				).toBeTruthy(),
			);
			expect(mocks.postBroadcast).not.toHaveBeenCalled();
			expect(mocks.navigate).not.toHaveBeenCalled();
		});
	});

	describe('logout flows stay on (or return to) the invitation link', () => {
		test('"Not you?" logs out and redirects back to the current invitation URL, not /login', () => {
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: true,
				isError: false,
				data: { email: 'jordan@latticecloud.com' },
			};

			renderAcceptInvitationRoute();
			fireEvent.click(
				screen.getByRole('button', {
					name: 'Not you? Use a different account',
				}),
			);

			expect(mocks.logout).toHaveBeenCalledWith({
				redirectTo: '/accept-invitation?id=enc-id&token=tok',
			});
		});

		test('wrong-account CTA for an existing invitee logs out and sends them to login, prefilled with the invited email', () => {
			mocks.loaderData = { ...VALID_LOADER_DATA, userExists: true };
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: true,
				isError: false,
				data: { email: 'rui@northwind.co' },
			};

			renderAcceptInvitationRoute();
			fireEvent.click(
				screen.getByRole('button', { name: 'Log out and sign in' }),
			);

			expect(mocks.logout).toHaveBeenCalledWith({
				redirectTo:
					'/login?rto=%2Faccept-invitation%3Fid%3Denc-id%26token%3Dtok&email=jordan%40latticecloud.com',
			});
		});

		test('wrong-account CTA for a brand-new invitee logs out and stays on the invitation link', () => {
			mocks.loaderData = { ...VALID_LOADER_DATA, userExists: false };
			mocks.hasBrowserSessionCookie.mockReturnValue(true);
			mocks.currentUserQuery = {
				isSuccess: true,
				isError: false,
				data: { email: 'rui@northwind.co' },
			};

			renderAcceptInvitationRoute();
			fireEvent.click(
				screen.getByRole('button', { name: 'Log out and continue' }),
			);

			expect(mocks.logout).toHaveBeenCalledWith({
				redirectTo: '/accept-invitation?id=enc-id&token=tok',
			});
		});
	});
});

describe('accept-invitation loader', () => {
	type AcceptInvitationLoaderResult = { view: 'invalid' };

	const loader = (
		Route.options as {
			loader: (args: {
				location: { searchStr: string };
			}) => Promise<AcceptInvitationLoaderResult>;
		}
	).loader;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('returns the invalid view when the id or token is missing from the URL', async () => {
		await expect(loader({ location: { searchStr: '' } })).resolves.toEqual({
			view: 'invalid',
		});
	});

	test('returns the invalid view when the check/details lookup fails', async () => {
		mocks.loadInvitationInfo.mockResolvedValue({ ok: false });

		await expect(
			loader({ location: { searchStr: '?id=enc-id&token=tok' } }),
		).resolves.toEqual({ view: 'invalid' });
	});

	test('returns the valid view with the token, email, profile, and userExists flag', async () => {
		mocks.loadInvitationInfo.mockResolvedValue({
			ok: true,
			email: 'jordan@latticecloud.com',
			profileName: 'Editor',
			userExists: true,
		});

		await expect(
			loader({ location: { searchStr: '?id=enc-id&token=tok' } }),
		).resolves.toEqual({
			view: 'valid',
			token: 'tok',
			email: 'jordan@latticecloud.com',
			profileName: 'Editor',
			userExists: true,
		});
	});
});
