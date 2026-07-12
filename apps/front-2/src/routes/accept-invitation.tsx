import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
	IconAlertTriangle,
	IconCircleCheckFilled,
	IconLoader2,
	IconMailX,
} from '@tabler/icons-react';
import {
	createFileRoute,
	useLoaderData,
	useLocation,
	useNavigate,
} from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthAlert } from '~/components/auth/auth-alert';
import { AuthFormHeader } from '~/components/auth/auth-form-header';
import { InvalidLinkView } from '~/components/auth/invalid-link-view';
import { PasswordField } from '~/components/auth/password-field';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import type { AuthBrand } from '~/layouts/auth-layout';
import { AuthLayout } from '~/layouts/auth-layout';
import { hasBrowserSessionCookie } from '~/lib/auth-route-guard';
import { useLogout } from '~/lib/hooks/use-logout';
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
import { cn } from '~/lib/utils';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { queryParamKey } from '@org/shared-ts/lib/constants';

type InvitationLoaderData =
	| { view: 'invalid' }
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
		return { view: 'invalid' };
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
	| { status: 'authenticated'; email: string };

/**
 * `isMounted` keeps the first client render identical to the SSR render
 * (both start out `false`, so there's no hydration mismatch) — the browser
 * session-cookie check and the current-user query only run after that first
 * commit, exactly like login.tsx's isMounted gate on the submit button.
 */
const useInvitationAuthState = (): AuthState => {
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	const hasSession = isMounted && hasBrowserSessionCookie();
	const currentUserQuery = useCurrentUserQuery({
		enabled: hasSession,
		retry: false,
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
		return { status: 'anonymous' };
	}

	return { status: 'checking' };
};

type BranchKind =
	| 'loading'
	| 'new-user'
	| 'existing-match'
	| 'existing-signed-out'
	| 'mismatch';

const resolveBranchKind = (
	loaderData: Extract<InvitationLoaderData, { view: 'valid' }>,
	authState: AuthState,
): BranchKind => {
	if (authState.status === 'checking') {
		return 'loading';
	}

	if (authState.status === 'anonymous') {
		return loaderData.userExists ? 'existing-signed-out' : 'new-user';
	}

	const emailMatches =
		authState.email.trim().toLowerCase() ===
		loaderData.email.trim().toLowerCase();

	return emailMatches ? 'existing-match' : 'mismatch';
};

type Translate = (key: string) => string;

const InvitationDetailsCard = ({
	email,
	profileName,
}: {
	email: string;
	profileName: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<Card size="sm" data-testid="accept-invitation-details-card">
			<CardContent className="space-y-3">
				<div>
					<p className="text-xs text-muted-foreground">{t('invited-email')}</p>
					<p className="text-sm font-medium text-foreground">{email}</p>
				</div>
				<div className="border-t border-border pt-3">
					<p className="text-xs text-muted-foreground">{t('profile')}</p>
					<span className="mt-0.5 inline-flex items-center rounded-[var(--publy-radius-chip)] bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
						{profileName}
					</span>
				</div>
			</CardContent>
		</Card>
	);
};

const AcceptInvitationLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="flex flex-col items-center gap-3 py-10"
			data-testid="accept-invitation-loading"
		>
			<IconLoader2
				role="status"
				aria-label={t('common-loading')}
				className="size-8 animate-spin text-muted-foreground"
			/>
		</div>
	);
};

type AcceptPayload =
	| {
			mode: 'new-user';
			firstName: string;
			lastName: string;
			password: string;
	  }
	| { mode: 'existing-account' };

/**
 * Shared accept → establish-session → broadcast → navigate sequence behind
 * both entry points (the new-user form submit and the "Join organization"
 * button) — mirrors login.tsx's two-step accept + completeLoginRedirect
 * dance so accepting an invitation signs the user in exactly like login does.
 */
const useAcceptInvitationSubmit = (token: string) => {
	const navigate = useNavigate();
	const { t } = useTranslation('common');
	const acceptAction = useServerFn(acceptInvitation);
	const completeRedirect = useServerFn(completeLoginRedirect);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');

	const submit = async (payload: AcceptPayload) => {
		setErrorMessage('');
		setIsSubmitting(true);

		try {
			const result = await acceptAction({ data: { token, ...payload } });
			const redirect = await completeRedirect({
				data: { sessionExpiresAt: result.sessionExpiresAt },
			});

			postBroadcast(AUTH_SYNC_CHANNEL, { type: 'login' });
			await navigate({ to: redirect.targetPath, replace: true });
		} catch (error) {
			const failure = toApiFailure(error);
			setErrorMessage(
				getFailureMessage(failure, { fallback: t('an-error-occurred') }),
			);
			setIsSubmitting(false);
		}
	};

	return { submit, isSubmitting, errorMessage };
};

type NewUserFormValues = {
	firstName: string;
	lastName: string;
	password: string;
	confirmPassword: string;
};

const getNewUserFormSchema = (t: Translate) =>
	z
		.object({
			firstName: z.string().min(1, t('first-name-required')),
			lastName: z.string().min(1, t('last-name-required')),
			password: z.string().min(12, t('at-least-12-chars-and-1-special-char')),
			confirmPassword: z.string(),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: t('passwords-do-not-match'),
			path: ['confirmPassword'],
		});

const NewUserForm = ({
	token,
	email,
	profileName,
}: {
	token: string;
	email: string;
	profileName: string;
}) => {
	const { t } = useTranslation('common');
	const { submit, errorMessage } = useAcceptInvitationSubmit(token);
	const formSchema = useMemo(() => getNewUserFormSchema(t), [t]);

	const {
		register,
		handleSubmit,
		formState: { isSubmitting, errors },
	} = useForm<NewUserFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			firstName: '',
			lastName: '',
			password: '',
			confirmPassword: '',
		},
	});

	const onSubmit = handleSubmit(async (values) => {
		await submit({
			mode: 'new-user',
			firstName: values.firstName,
			lastName: values.lastName,
			password: values.password,
		});
	});

	return (
		<div className="space-y-6" data-testid="accept-invitation-new-user">
			<InvitationDetailsCard email={email} profileName={profileName} />

			<div>
				<AuthFormHeader title={t('create-your-account')} />
				<p className="mt-1 text-sm text-muted-foreground">
					{t('accept-invitation-new-user-description', { role: profileName })}
				</p>
			</div>

			<form
				onSubmit={onSubmit}
				className="space-y-4"
				data-testid="accept-invitation-new-user-form"
			>
				<fieldset
					disabled={isSubmitting}
					className="m-0 space-y-4 border-0 p-0"
				>
					{errorMessage ? (
						<AuthAlert
							tone="danger"
							icon={<IconAlertCircle aria-hidden="true" />}
							testId="accept-invitation-error-alert"
						>
							{errorMessage}
						</AuthAlert>
					) : null}

					<div className="flex flex-col gap-4 sm:flex-row">
						<div className="flex-1 space-y-1.5">
							<label
								htmlFor="accept-invitation-first-name"
								className="text-[13px] font-medium text-foreground"
							>
								{t('auth-first-name')}
							</label>
							<Input
								{...register('firstName')}
								id="accept-invitation-first-name"
								required
								placeholder={t('auth-first-name')}
								aria-invalid={Boolean(errors.firstName?.message) || undefined}
								autoComplete="given-name"
								className="h-11 text-sm lg:h-10 lg:text-[13px]"
							/>
							{errors.firstName?.message ? (
								<p className="text-xs text-destructive">
									{errors.firstName.message}
								</p>
							) : null}
						</div>
						<div className="flex-1 space-y-1.5">
							<label
								htmlFor="accept-invitation-last-name"
								className="text-[13px] font-medium text-foreground"
							>
								{t('auth-last-name')}
							</label>
							<Input
								{...register('lastName')}
								id="accept-invitation-last-name"
								required
								placeholder={t('auth-last-name')}
								aria-invalid={Boolean(errors.lastName?.message) || undefined}
								autoComplete="family-name"
								className="h-11 text-sm lg:h-10 lg:text-[13px]"
							/>
							{errors.lastName?.message ? (
								<p className="text-xs text-destructive">
									{errors.lastName.message}
								</p>
							) : null}
						</div>
					</div>

					<div>
						<PasswordField
							id="accept-invitation-password"
							label={t('password')}
							register={register('password')}
							required
							invalid={Boolean(errors.password?.message)}
							autoComplete="new-password"
						/>
						{errors.password?.message ? (
							<p className="mt-1.5 text-xs text-destructive">
								{errors.password.message}
							</p>
						) : null}
					</div>

					<div>
						<PasswordField
							id="accept-invitation-confirm-password"
							label={t('confirm-password')}
							register={register('confirmPassword')}
							required
							invalid={Boolean(errors.confirmPassword?.message)}
							autoComplete="new-password"
						/>
						{errors.confirmPassword?.message ? (
							<p className="mt-1.5 text-xs text-destructive">
								{errors.confirmPassword.message}
							</p>
						) : null}
					</div>

					<Button
						type="submit"
						variant="default"
						disabled={isSubmitting}
						className="h-12 w-full text-sm lg:h-11"
					>
						{t('create-account')}
					</Button>
				</fieldset>
			</form>
		</div>
	);
};

const ExistingMatchView = ({
	token,
	email,
	profileName,
	currentEmail,
	stayOnPageHref,
}: {
	token: string;
	email: string;
	profileName: string;
	currentEmail: string;
	stayOnPageHref: string;
}) => {
	const { t } = useTranslation('common');
	const { submit, isSubmitting, errorMessage } =
		useAcceptInvitationSubmit(token);
	const { logout, isLoggingOut } = useLogout();

	return (
		<div className="space-y-6" data-testid="accept-invitation-existing-match">
			<InvitationDetailsCard email={email} profileName={profileName} />

			<div>
				<AuthFormHeader title={t('accept-invitation-title')} />
				<p className="mt-1 text-sm text-muted-foreground">
					{t('auth-invitation-existing-user-authenticated-description')}
				</p>
			</div>

			{errorMessage ? (
				<AuthAlert
					tone="danger"
					icon={<IconAlertCircle aria-hidden="true" />}
					testId="accept-invitation-error-alert"
				>
					{errorMessage}
				</AuthAlert>
			) : null}

			<div
				className="flex items-center justify-between gap-2 rounded-[var(--publy-radius-medium-control)] border border-border bg-muted/40 px-3 py-2.5"
				data-testid="accept-invitation-signed-in-as"
			>
				<div>
					<p className="text-xs text-muted-foreground">{t('signed-in-as')}</p>
					<p className="text-sm font-medium text-foreground">{currentEmail}</p>
				</div>
				<IconCircleCheckFilled
					aria-hidden="true"
					className="size-5 shrink-0 text-(--publy-alert-success-text)"
				/>
			</div>

			<Button
				type="button"
				variant="default"
				disabled={isSubmitting || isLoggingOut}
				className="h-12 w-full text-sm lg:h-11"
				onClick={() => submit({ mode: 'existing-account' })}
			>
				{t('join-organization')}
			</Button>

			<div className="text-center">
				<button
					type="button"
					disabled={isLoggingOut}
					className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
					onClick={() => logout({ redirectTo: stayOnPageHref })}
				>
					{t('accept-invitation-not-you')}
				</button>
			</div>
		</div>
	);
};

const ExistingSignedOutView = ({
	email,
	profileName,
	loginHref,
}: {
	email: string;
	profileName: string;
	loginHref: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<div
			className="space-y-6"
			data-testid="accept-invitation-existing-signed-out"
		>
			<InvitationDetailsCard email={email} profileName={profileName} />

			<div>
				<AuthFormHeader title={t('accept-invitation-title')} />
				<p className="mt-1 text-sm text-muted-foreground">
					{t('auth-invitation-existing-user-login-description')}
				</p>
			</div>

			<a
				href={loginHref}
				className={cn(
					buttonVariants({ variant: 'default' }),
					'h-12 w-full text-sm lg:h-11',
				)}
			>
				{t('sign-in-to-continue')}
			</a>

			<p className="text-center text-xs text-muted-foreground">
				{t('accept-invitation-return-note', { email })}
			</p>
		</div>
	);
};

const MismatchView = ({
	email,
	profileName,
	currentEmail,
	userExists,
	loginHref,
	stayOnPageHref,
}: {
	email: string;
	profileName: string;
	currentEmail: string;
	userExists: boolean;
	loginHref: string;
	stayOnPageHref: string;
}) => {
	const { t } = useTranslation('common');
	const { logout, isLoggingOut } = useLogout();

	const descriptionKey = userExists
		? 'auth-invitation-existing-user-mismatch-description'
		: 'auth-invitation-new-user-mismatch-description';
	const ctaKey = userExists
		? 'auth-invitation-log-out-and-sign-in'
		: 'auth-invitation-log-out-and-continue';
	const redirectTo = userExists ? loginHref : stayOnPageHref;

	return (
		<div className="space-y-6" data-testid="accept-invitation-mismatch">
			<InvitationDetailsCard email={email} profileName={profileName} />

			<div>
				<AuthFormHeader title={t('auth-invitation-wrong-account-title')} />
				<p className="mt-1 text-sm text-muted-foreground">
					<Trans
						i18nKey={descriptionKey}
						values={{ invitationEmail: email, currentUserEmail: currentEmail }}
						components={{ strong: <strong className="text-foreground" /> }}
					/>
				</p>
			</div>

			<div
				className="flex items-center justify-between gap-2 rounded-[var(--publy-radius-medium-control)] border border-(--publy-alert-danger-border) bg-(--publy-alert-danger-bg) px-3 py-2.5"
				data-testid="accept-invitation-wrong-account-row"
			>
				<div>
					<p className="text-xs text-(--publy-alert-danger-text)">
						{t('signed-in-as')}
					</p>
					<p className="text-sm font-medium text-(--publy-alert-danger-text)">
						{currentEmail}
					</p>
				</div>
				<IconAlertTriangle
					aria-hidden="true"
					className="size-5 shrink-0 text-(--publy-alert-danger-text)"
				/>
			</div>

			<Button
				type="button"
				variant="default"
				disabled={isLoggingOut}
				className="h-12 w-full text-sm lg:h-11"
				onClick={() => logout({ redirectTo })}
			>
				{t(ctaKey)}
			</Button>
		</div>
	);
};

const BRAND_KEY_BY_BRANCH: Partial<
	Record<BranchKind, { headline: string; subtitle: string }>
> = {
	'new-user': {
		headline: 'accept-invitation-brand-headline-new-user',
		subtitle: 'accept-invitation-brand-subtitle-new-user',
	},
	'existing-match': {
		headline: 'accept-invitation-brand-headline-existing-match',
		subtitle: 'accept-invitation-brand-subtitle-existing-match',
	},
	'existing-signed-out': {
		headline: 'accept-invitation-brand-headline-existing-signed-out',
		subtitle: 'accept-invitation-brand-subtitle-existing-signed-out',
	},
	mismatch: {
		headline: 'accept-invitation-brand-headline-mismatch',
		subtitle: 'accept-invitation-brand-subtitle-mismatch',
	},
};

const AcceptInvitationRoute = () => {
	const loaderData = useLoaderData({
		from: '/accept-invitation',
	}) as InvitationLoaderData;
	const location = useLocation();
	const authState = useInvitationAuthState();
	const { t } = useTranslation('common');

	if (loaderData.view === 'invalid') {
		return (
			<AuthLayout>
				<InvalidLinkView
					icon={<IconMailX aria-hidden="true" className="size-7" />}
					title={t('auth-invitation-invalid')}
					description={t('auth-invitation-invalid-description')}
					testId="accept-invitation-invalid-link-view"
				/>
			</AuthLayout>
		);
	}

	const branchKind = resolveBranchKind(loaderData, authState);
	const brandKeys = BRAND_KEY_BY_BRANCH[branchKind];
	const brand: AuthBrand | undefined = brandKeys
		? {
				eyebrow: t('accept-invitation-brand-eyebrow'),
				headline: t(brandKeys.headline),
				subtitle: t(brandKeys.subtitle),
			}
		: undefined;

	const stayOnPageHref = `${location.pathname}${location.searchStr}`;
	const loginHref = `/login?${new URLSearchParams({
		[queryParamKey.login_page.redirect_to]: stayOnPageHref,
		[queryParamKey.login_page.email]: loaderData.email,
	}).toString()}`;

	return (
		<AuthLayout brand={brand}>
			{branchKind === 'loading' ? <AcceptInvitationLoading /> : null}
			{branchKind === 'new-user' ? (
				<NewUserForm
					token={loaderData.token}
					email={loaderData.email}
					profileName={loaderData.profileName}
				/>
			) : null}
			{branchKind === 'existing-match' ? (
				<ExistingMatchView
					token={loaderData.token}
					email={loaderData.email}
					profileName={loaderData.profileName}
					currentEmail={
						authState.status === 'authenticated' ? authState.email : ''
					}
					stayOnPageHref={stayOnPageHref}
				/>
			) : null}
			{branchKind === 'existing-signed-out' ? (
				<ExistingSignedOutView
					email={loaderData.email}
					profileName={loaderData.profileName}
					loginHref={loginHref}
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
		</AuthLayout>
	);
};

export const Route = createFileRoute('/accept-invitation')({
	loader: invitationLoader,
	component: AcceptInvitationRoute,
});
