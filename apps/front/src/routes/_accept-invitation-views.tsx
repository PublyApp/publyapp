import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
	IconAlertTriangle,
	IconCircleCheckFilled,
	IconLoader2,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthAlert } from '~/components/auth/auth-alert';
import { AuthFormHeader } from '~/components/auth/auth-form-header';
import { PasswordField } from '~/components/auth/password-field';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { useHydrated } from '~/lib/hooks/use-hydrated';
import { useLogout } from '~/lib/hooks/use-logout';
import { cn } from '~/lib/utils';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { PASSWORD_MIN_LENGTH } from '@org/shared-ts/lib/auth-password-policy';

import { ACCEPT_INVITATION_MISMATCH_I18N_KEYS } from './_accept-invitation-i18n-keys';
// View-layer contracts shared with the route module (which owns the submit
// hook producing these values). Type-only import back into the route keeps
// this a one-way runtime dependency.
import type { AcceptPayload } from './accept-invitation';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type NewUserFormValues = {
	firstName: string;
	lastName: string;
	password: string;
	confirmPassword: string;
};

const getNewUserFormSchema = (t: Translate) =>
	z
		.object({
			firstName: z.string().trim().min(1, t('first-name-required')),
			lastName: z.string().trim().min(1, t('last-name-required')),
			password: z
				.string()
				.min(
					PASSWORD_MIN_LENGTH,
					t('password-min-length-hint-n', { characters: PASSWORD_MIN_LENGTH }),
				),
			confirmPassword: z.string(),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: t('passwords-do-not-match'),
			path: ['confirmPassword'],
		});

const InvitationDetailsCard = ({
	email,
	profileName,
}: {
	email: string;
	profileName: string;
}) => {
	const { t } = useTranslation(['auth', 'common']);

	return (
		<Card size="sm" data-testid="accept-invitation-details-card">
			<CardContent className="space-y-3">
				<div>
					<p className="text-xs text-muted-foreground">{t('invited-email')}</p>
					<p className="text-sm font-medium text-foreground">{email}</p>
				</div>
				<div className="border-t border-border pt-3">
					<p className="text-xs text-muted-foreground">{t('common:profile')}</p>
					<span className="mt-0.5 inline-flex items-center rounded-[var(--publy-radius-chip)] bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
						{profileName}
					</span>
				</div>
			</CardContent>
		</Card>
	);
};

export const AcceptInvitationLoading = () => {
	const { t } = useTranslation(['auth', 'common']);

	return (
		<div
			className="flex flex-col items-center gap-3 py-10"
			data-testid="accept-invitation-loading"
		>
			<IconLoader2
				role="status"
				aria-label={t('common:common-loading')}
				className="size-8 animate-spin text-muted-foreground"
			/>
		</div>
	);
};

export const AuthLookupErrorView = ({
	error,
	onRetry,
	isRetrying,
}: {
	error: unknown;
	onRetry: () => void;
	isRetrying: boolean;
}) => {
	const { t } = useTranslation(['auth', 'common']);
	const failure = toApiFailure(error);
	const message = getFailureMessage(failure, {
		fallback: t('common:an-error-occurred'),
	});

	return (
		<div
			className="space-y-6"
			data-testid="accept-invitation-auth-lookup-error"
		>
			<AuthAlert tone="danger" icon={<IconAlertCircle aria-hidden="true" />}>
				{message}
			</AuthAlert>
			<Button
				type="button"
				variant="outline"
				disabled={isRetrying}
				onClick={onRetry}
			>
				{t('common:try-again')}
			</Button>
		</div>
	);
};

export const NewUserForm = ({
	email,
	profileName,
	submit,
	isSubmitting: isAcceptSubmitting,
	errorMessage,
}: {
	email: string;
	profileName: string;
	submit: (payload: AcceptPayload) => Promise<void>;
	isSubmitting: boolean;
	errorMessage: string;
}) => {
	const { t } = useTranslation(['auth', 'common']);
	const formSchema = useMemo(() => getNewUserFormSchema(t), [t]);
	const isHydrated = useHydrated();

	const {
		register,
		handleSubmit,
		formState: { isSubmitting: isFormSubmitting, errors },
	} = useForm<NewUserFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			firstName: '',
			lastName: '',
			password: '',
			confirmPassword: '',
		},
	});
	const isSubmitting = isFormSubmitting || isAcceptSubmitting;

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
				method="post"
				className="space-y-4"
				data-testid="accept-invitation-new-user-form"
			>
				<fieldset
					disabled={!isHydrated || isSubmitting}
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
							label={t('common:password')}
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
						disabled={!isHydrated || isSubmitting}
						className="h-12 w-full text-sm lg:h-11"
					>
						{t('create-account')}
					</Button>
				</fieldset>
			</form>
		</div>
	);
};

export const ExistingMatchView = ({
	email,
	profileName,
	currentEmail,
	stayOnPageHref,
	submit,
	isSubmitting,
	errorMessage,
}: {
	email: string;
	profileName: string;
	currentEmail: string;
	stayOnPageHref: string;
	submit: (payload: AcceptPayload) => Promise<void>;
	isSubmitting: boolean;
	errorMessage: string;
}) => {
	const { t } = useTranslation(['auth', 'common']);
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

export const ExistingSignedOutView = ({
	email,
	profileName,
	loginSearch,
}: {
	email: string;
	profileName: string;
	loginSearch: Record<string, string>;
}) => {
	const { t } = useTranslation(['auth', 'common']);

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

			<Link
				to="/login"
				search={loginSearch}
				className={cn(
					buttonVariants({ variant: 'default' }),
					'h-12 w-full text-sm lg:h-11',
				)}
			>
				{t('sign-in-to-continue')}
			</Link>

			<p className="text-center text-xs text-muted-foreground">
				{t('accept-invitation-return-note', { email })}
			</p>
		</div>
	);
};

export const MismatchView = ({
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
	const { t } = useTranslation(['auth', 'common']);
	const { logout, isLoggingOut } = useLogout();

	const mismatchKeys =
		ACCEPT_INVITATION_MISMATCH_I18N_KEYS[userExists ? 'existing' : 'newUser'];
	const redirectTo = userExists ? loginHref : stayOnPageHref;

	return (
		<div className="space-y-6" data-testid="accept-invitation-mismatch">
			<InvitationDetailsCard email={email} profileName={profileName} />

			<div>
				<AuthFormHeader title={t('auth-invitation-wrong-account-title')} />
				<p className="mt-1 text-sm text-muted-foreground">
					{/* Literal keys + ns="auth": <Trans>'s static typing requires
					    UNqualified keys, unlike t() which accepts `auth:` ones. */}
					{userExists ? (
						<Trans
							i18nKey="auth-invitation-existing-user-mismatch-description"
							ns="auth"
							values={{
								invitationEmail: email,
								currentUserEmail: currentEmail,
							}}
							components={{ strong: <strong className="text-foreground" /> }}
						/>
					) : (
						<Trans
							i18nKey="auth-invitation-new-user-mismatch-description"
							ns="auth"
							values={{
								invitationEmail: email,
								currentUserEmail: currentEmail,
							}}
							components={{ strong: <strong className="text-foreground" /> }}
						/>
					)}
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
				{t(mismatchKeys.cta)}
			</Button>
		</div>
	);
};
