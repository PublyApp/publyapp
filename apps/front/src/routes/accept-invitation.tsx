import { IconMailX } from '@tabler/icons-react';
import {
	createFileRoute,
	useLoaderData,
	useLocation,
	useNavigate,
} from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InvalidLinkView } from '~/components/auth/invalid-link-view';
import { PrecheckUnavailableView } from '~/components/auth/precheck-unavailable-view';
import type { AuthBrand } from '~/layouts/auth-layout';
import { useSetAuthBrand } from '~/lib/auth-brand-context';
import { hasBrowserSessionCookie } from '~/lib/auth-route-guard';
import { useHydrated } from '~/lib/hooks/use-hydrated';
import { useCurrentUserQuery } from '~/lib/query/auth';
import {
	acceptInvitation,
	loadInvitationInfo,
} from '~/lib/server/invitation-actions';
import { completeLoginRedirect } from '~/lib/server/session-actions';
import {
	AUTH_SYNC_CHANNEL,
	postBroadcast,
} from '~/lib/tab-sync/broadcast-sync';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { queryParamKey } from '@org/shared-ts/lib/constants';

import { ACCEPT_INVITATION_BRAND_I18N_KEYS } from './_accept-invitation-i18n-keys';
import {
	AcceptInvitationLoading,
	AuthLookupErrorView,
	ExistingMatchView,
	ExistingSignedOutView,
	MismatchView,
	NewUserForm,
} from './_accept-invitation-views';

type InvitationLoaderData =
	| { view: 'invalid' }
	| { view: 'unavailable' }
	| {
			view: 'valid';
			token: string;
			email: string;
			profileName: string;
			userExists: boolean;
	  };

const invitationLoader = async ({
	location,
}: {
	location: { searchStr: string };
}): Promise<InvitationLoaderData> => {
	const params = new URLSearchParams(location.searchStr ?? '');
	const id = params.get(queryParamKey.accept_invitation_page.encoded_email);
	const token = params.get(queryParamKey.accept_invitation_page.token);

	if (!id || !token) {
		return { view: 'invalid' };
	}

	const result = await loadInvitationInfo({ data: { id, token } });
	if (!result.ok) {
		return {
			view: result.reason === 'unavailable' ? 'unavailable' : 'invalid',
		};
	}

	return {
		view: 'valid',
		token,
		email: result.email,
		profileName: result.profileName,
		userExists: result.userExists,
	};
};

type AuthState =
	| { status: 'checking' }
	| { status: 'anonymous' }
	| { status: 'authenticated'; email: string }
	| {
			status: 'auth-lookup-error';
			error: unknown;
			refetch: () => void;
			isRefetching: boolean;
	  };

/**
 * `useHydrated` keeps the first client render identical to the SSR render
 * (both start out `false`, so there's no hydration mismatch) — the browser
 * session-cookie check and the current-user query only run after that first
 * commit, exactly like login.tsx's isMounted gate on the submit button.
 */
const useInvitationAuthState = (): AuthState => {
	const isMounted = useHydrated();

	const hasSession = isMounted && hasBrowserSessionCookie();
	const currentUserQuery = useCurrentUserQuery({
		enabled: hasSession,
		retry: false,
		authSurface: true,
	});

	if (!isMounted) {
		return { status: 'checking' };
	}

	if (!hasSession) {
		return { status: 'anonymous' };
	}

	if (currentUserQuery.isSuccess) {
		return {
			status: 'authenticated',
			email: currentUserQuery.data?.email ?? '',
		};
	}

	if (currentUserQuery.isError) {
		const failure = toApiFailure(currentUserQuery.error);
		if (failure.kind === 'problem' && failure.status === 401) {
			return { status: 'anonymous' };
		}

		return {
			status: 'auth-lookup-error',
			error: currentUserQuery.error,
			refetch: () => void currentUserQuery.refetch(),
			isRefetching: currentUserQuery.isFetching,
		};
	}

	return { status: 'checking' };
};

type BranchKind =
	| 'loading'
	| 'new-user'
	| 'existing-match'
	| 'existing-signed-out'
	| 'mismatch'
	| 'auth-lookup-error';

const resolveBranchKind = (
	loaderData: Extract<InvitationLoaderData, { view: 'valid' }>,
	authState: AuthState,
): BranchKind => {
	if (authState.status === 'checking') {
		return 'loading';
	}

	if (authState.status === 'anonymous') {
		if (loaderData.userExists) {
			return 'existing-signed-out';
		}
		return 'new-user';
	}

	if (authState.status === 'auth-lookup-error') {
		return 'auth-lookup-error';
	}

	const emailMatches =
		authState.email.trim().toLowerCase() ===
		loaderData.email.trim().toLowerCase();

	if (emailMatches) {
		return 'existing-match';
	}
	return 'mismatch';
};

export type AcceptPayload =
	| {
			mode: 'new-user';
			firstName: string;
			lastName: string;
			password: string;
	  }
	| { mode: 'existing-account' };

type AcceptInvitationActionResult = {
	sessionExpiresAt?: string;
	tenantId?: string;
	userId?: string;
};

/**
 * Shared accept → establish-session → broadcast → navigate sequence behind
 * both entry points (the new-user form submit and the "Join organization"
 * button) — mirrors login.tsx's two-step accept + completeLoginRedirect
 * dance so accepting an invitation signs the user in exactly like login does.
 */
const useAcceptInvitationSubmit = (token: string) => {
	const navigate = useNavigate();
	const { t } = useTranslation(['auth', 'common']);
	const acceptAction = useServerFn(acceptInvitation);
	const completeRedirect = useServerFn(completeLoginRedirect);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [acceptedResult, setAcceptedResult] =
		useState<AcceptInvitationActionResult | null>(null);
	const [pendingRedirect, setPendingRedirect] = useState<{
		to: string;
		replace: boolean;
	} | null>(null);

	useEffect(() => {
		if (!pendingRedirect) {
			return;
		}
		setPendingRedirect(null);
		void navigate(pendingRedirect);
	}, [pendingRedirect, navigate]);

	const submit = async (payload: AcceptPayload) => {
		setErrorMessage('');
		setIsSubmitting(true);

		try {
			const result =
				acceptedResult ??
				((await acceptAction({
					data: { token, ...payload },
				})) as AcceptInvitationActionResult) ??
				null;
			if (!acceptedResult) {
				setAcceptedResult(result);
			}

			if (result.sessionExpiresAt !== undefined) {
				const redirect = await completeRedirect({
					data: { sessionExpiresAt: result.sessionExpiresAt },
				});

				postBroadcast(AUTH_SYNC_CHANNEL, { type: 'login' });
				// Deferred navigation: the redirect target is committed here,
				// an effect performs the navigation after the next render. This
				// keeps every navigate() call out of event-handler/render-phase
				// analysis paths (tanstack-start-no-navigate-in-render) while
				// preserving exactly one navigation per successful acceptance.
				setPendingRedirect({ to: redirect.targetPath, replace: true });
				return;
			}
			// No `throw` inside try/catch: the React Compiler cannot lower
			// ThrowStatement-in-try yet and would skip this component. A
			// missing expiry is not an API failure, so surface the same
			// generic error message the old throw-and-catch produced.
			setErrorMessage(t('common:an-error-occurred'));
		} catch (error) {
			const failure = toApiFailure(error);
			setErrorMessage(
				getFailureMessage(failure, {
					fallback: t('common:an-error-occurred'),
				}),
			);
		}
		// No try/finally: the React Compiler cannot lower finally clauses
		// yet and would skip this component.
		setIsSubmitting(false);
	};

	return { submit, isSubmitting, errorMessage };
};

const AcceptInvitationRoute = () => {
	const loaderData = useLoaderData({
		from: '/accept-invitation',
	}) as InvitationLoaderData;
	const location = useLocation();
	const authState = useInvitationAuthState();
	const { t } = useTranslation(['auth', 'common']);
	// Owned above branch selection (keyed by the invitation token, which is
	// fixed for the lifetime of this route) so the committed acceptance result
	// survives an auth-state transition that swaps the rendered branch between
	// NewUserForm and ExistingMatchView (r5-F2) — each of those used to
	// instantiate its own instance of this hook and lost `acceptedResult` on
	// unmount.
	const acceptSubmit = useAcceptInvitationSubmit(
		loaderData.view === 'valid' ? loaderData.token : '',
	);

	// Hooks run unconditionally regardless of which branch below renders —
	// `resolveBranchKind` needs `loaderData` narrowed to the 'valid' variant,
	// so the narrowing happens in this ternary rather than after an early
	// return, which would violate the rules of hooks for `useSetAuthBrand`.
	const branchKind =
		loaderData.view === 'valid'
			? resolveBranchKind(loaderData, authState)
			: undefined;
	const brandKeys =
		branchKind === 'new-user' ||
		branchKind === 'existing-match' ||
		branchKind === 'existing-signed-out' ||
		branchKind === 'mismatch'
			? ACCEPT_INVITATION_BRAND_I18N_KEYS[branchKind]
			: undefined;
	const brand: AuthBrand | undefined = brandKeys
		? {
				eyebrow: t('accept-invitation-brand-eyebrow'),
				headline: t(brandKeys.headline),
				subtitle: t(brandKeys.subtitle),
			}
		: undefined;

	// __root.tsx's RoutedShell now renders the single AuthLayout instance for
	// every auth-surface route (see F1) — this pushes this route's per-branch
	// brand copy up into it instead of nesting a second AuthLayout here.
	useSetAuthBrand(brand);

	if (loaderData.view === 'unavailable') {
		return (
			<PrecheckUnavailableView testId="accept-invitation-precheck-unavailable-view" />
		);
	}

	if (loaderData.view === 'invalid') {
		return (
			<InvalidLinkView
				icon={<IconMailX aria-hidden="true" className="size-7" />}
				title={t('auth-invitation-invalid')}
				description={t('auth-invitation-invalid-description')}
				testId="accept-invitation-invalid-link-view"
			/>
		);
	}

	const stayOnPageHref = `${location.pathname}${location.searchStr}`;
	const loginSearch = {
		[queryParamKey.login_page.redirect_to]: stayOnPageHref,
		[queryParamKey.login_page.email]: loaderData.email,
	};
	const loginHref = `/login?${new URLSearchParams(loginSearch).toString()}`;
	const showAuthLookupError =
		branchKind === 'auth-lookup-error' &&
		authState.status === 'auth-lookup-error';

	return (
		<>
			{branchKind === 'loading' ? <AcceptInvitationLoading /> : null}
			{showAuthLookupError && authState.status === 'auth-lookup-error' ? (
				<AuthLookupErrorView
					error={authState.error}
					onRetry={authState.refetch}
					isRetrying={authState.isRefetching}
				/>
			) : null}
			{branchKind === 'new-user' ? (
				<NewUserForm
					email={loaderData.email}
					profileName={loaderData.profileName}
					submit={acceptSubmit.submit}
					isSubmitting={acceptSubmit.isSubmitting}
					errorMessage={acceptSubmit.errorMessage}
				/>
			) : null}
			{branchKind === 'existing-match' ? (
				<ExistingMatchView
					email={loaderData.email}
					profileName={loaderData.profileName}
					currentEmail={
						authState.status === 'authenticated' ? authState.email : ''
					}
					stayOnPageHref={stayOnPageHref}
					submit={acceptSubmit.submit}
					isSubmitting={acceptSubmit.isSubmitting}
					errorMessage={acceptSubmit.errorMessage}
				/>
			) : null}
			{branchKind === 'existing-signed-out' ? (
				<ExistingSignedOutView
					email={loaderData.email}
					profileName={loaderData.profileName}
					loginSearch={loginSearch}
				/>
			) : null}
			{branchKind === 'mismatch' ? (
				<MismatchView
					email={loaderData.email}
					profileName={loaderData.profileName}
					currentEmail={
						authState.status === 'authenticated' ? authState.email : ''
					}
					userExists={loaderData.userExists}
					loginHref={loginHref}
					stayOnPageHref={stayOnPageHref}
				/>
			) : null}
		</>
	);
};

export const Route = createFileRoute('/accept-invitation')({
	staticData: { i18nNamespaces: ['auth'], crumbs: 'shell' },
	loader: invitationLoader,
	component: AcceptInvitationRoute,
});
