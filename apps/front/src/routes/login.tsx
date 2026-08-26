import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
	IconCircleCheck,
	IconClockExclamation,
	IconLoader2,
	IconLock,
} from '@tabler/icons-react';
import {
	Link,
	useLocation,
	useNavigate,
	useRouter,
	createFileRoute,
} from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthAlert } from '~/components/auth/auth-alert';
import { AuthFormHeader } from '~/components/auth/auth-form-header';
import { PasswordField } from '~/components/auth/password-field';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { Input } from '~/components/ui/input';
import { redirectAuthenticatedUserAwayFromAuthPage } from '~/lib/auth-route-guard';
import { useHydrated } from '~/lib/hooks/use-hydrated';
import { completeLoginRedirect, login } from '~/lib/server/session-actions';
import {
	AUTH_SYNC_CHANNEL,
	postBroadcast,
} from '~/lib/tab-sync/broadcast-sync';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';
import {
	getSafeSearchRedirect,
	isAllowedRedirectPath,
	resolveRouteRedirect,
} from '@org/shared-ts/lib/safe-redirect-path';

type LoginFormValues = {
	email: string;
	password: string;
};

type Translate = (key: string) => string;

const getLoginFormSchema = (t: Translate) =>
	z.object({
		email: z.string().max(120).email(t('enter-valid-email-address')),
		password: z.string().min(1, t('password-is-required')),
	});

const isSessionExpiredFromSearch = (search: string): boolean => {
	const params = new URLSearchParams(search);
	return (
		params.get(queryParamKey.login_page.redirect_cause) ===
		queryParamValue.login_page.redirect_cause.invalid_session
	);
};

const isPasswordResetSuccessFromSearch = (search: string): boolean => {
	const params = new URLSearchParams(search);
	return (
		params.get(queryParamKey.login_page.redirect_cause) ===
		queryParamValue.login_page.redirect_cause.password_reset_success
	);
};

/** An invitation link's "Sign in to continue" CTA hands the invited email
 * through so the user doesn't have to retype an address the app already
 * knows (see F4). */
const getPrefilledEmailFromSearch = (search: string): string => {
	const params = new URLSearchParams(search);
	return params.get(queryParamKey.login_page.email) ?? '';
};

const getFailureStatus = (error: unknown): number | undefined => {
	const failure = toApiFailure(error);
	if (failure.kind === 'problem') {
		return failure.status;
	}

	return undefined;
};

const LoginRoute = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { t } = useTranslation(['auth', 'common']);
	const [showForbidden, setShowForbidden] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [invalidCredentialsMessage, setInvalidCredentialsMessage] =
		useState('');
	const isMounted = useHydrated();

	const loginAction = useServerFn(login);
	const completeRedirect = useServerFn(completeLoginRedirect);
	const search = location.searchStr ?? '';
	const isSessionExpired = isSessionExpiredFromSearch(search);
	const isPasswordResetSuccess = isPasswordResetSuccessFromSearch(search);

	const loginFormSchema = useMemo(() => getLoginFormSchema(t), [t]);

	const {
		register,
		handleSubmit,
		setError,
		formState: { isSubmitting, errors },
	} = useForm<LoginFormValues>({
		resolver: zodResolver(loginFormSchema),
		defaultValues: {
			email: getPrefilledEmailFromSearch(search),
			password: '',
		},
	});

	const onSubmit = async (values: LoginFormValues) => {
		setShowForbidden(false);
		setErrorMessage('');
		setInvalidCredentialsMessage('');

		try {
			const { sessionExpiresAt } = await loginAction({
				data: {
					email: values.email,
					password: values.password,
				},
			});

			const redirect = await completeRedirect({
				data: { sessionExpiresAt },
			});
			const requested = getSafeSearchRedirect(search);
			const finalTarget = isAllowedRedirectPath(requested, redirect.targetPath)
				? requested
				: redirect.targetPath;
			const resolvedTarget = resolveRouteRedirect(finalTarget);

			postBroadcast(AUTH_SYNC_CHANNEL, { type: 'login' });
			await navigate({
				to: resolvedTarget,
				replace: true,
			});
		} catch (error) {
			const failure = toApiFailure(error);

			if (failure.kind === 'problem' && failure.status === 401) {
				setInvalidCredentialsMessage(
					getFailureMessage(failure, {
						fallback: t('invalid-credentials-description'),
					}),
				);
				return;
			}

			if (failure.kind === 'problem' && failure.status === 403) {
				setShowForbidden(true);
				return;
			}

			if (failure.kind === 'validation') {
				const formFields: Array<keyof LoginFormValues> = ['email', 'password'];
				let mappedToField = false;
				for (const field of formFields) {
					const message = failure.fieldErrors[field]?.[0];
					if (message) {
						setError(field, { message });
						mappedToField = true;
					}
				}
				if (!mappedToField) {
					setError('email', {
						message: getFailureMessage(failure, {
							fallback: t('enter-valid-email-and-password'),
						}),
					});
				}
				return;
			}

			const message = getFailureMessage(failure, {
				fallback: t('sign-in-failed-check-credentials'),
			});
			setErrorMessage(message);
		}
	};

	if (showForbidden) {
		return <View403 />;
	}

	const isDisabled = !isMounted || isSubmitting;
	const passwordFieldErrorMessage = errors.password?.message;
	const isPasswordInvalid = Boolean(
		passwordFieldErrorMessage || invalidCredentialsMessage,
	);

	return (
		<div className="space-y-6">
			{isSessionExpired ? (
				<AuthAlert
					tone="amber"
					icon={<IconClockExclamation aria-hidden="true" />}
					testId="auth-session-expired-alert"
				>
					{t('session-expired-notice')}
				</AuthAlert>
			) : null}

			{isPasswordResetSuccess ? (
				<AuthAlert
					tone="success"
					icon={<IconCircleCheck aria-hidden="true" />}
					testId="auth-password-reset-success-alert"
				>
					{t('password-reset-success')}
				</AuthAlert>
			) : null}

			<AuthFormHeader
				title={isSessionExpired ? t('welcome-back') : t('common:sign-in')}
				secondary={
					isSessionExpired ? (
						t('sign-in-to-pick-up-where-you-left-off')
					) : (
						<>
							{t('no-account-yet')}{' '}
							<Link
								to="/signup"
								className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-(--publy-primary-foreground)"
							>
								{t('create-one')}
							</Link>
						</>
					)
				}
			/>

			<form
				onSubmit={handleSubmit(onSubmit)}
				className="space-y-4"
				data-testid="auth-login-form"
			>
				<fieldset disabled={isDisabled} className="m-0 space-y-4 border-0 p-0">
					{invalidCredentialsMessage ? (
						<AuthAlert
							tone="danger"
							icon={<IconAlertCircle aria-hidden="true" />}
							testId="auth-invalid-credentials-alert"
						>
							{invalidCredentialsMessage}
						</AuthAlert>
					) : null}

					<div className="space-y-1.5">
						<label
							htmlFor="login-email"
							className="text-[13px] font-medium text-foreground"
						>
							{t('common:email-address')}
						</label>
						<Input
							{...register('email')}
							id="login-email"
							required
							type="email"
							placeholder={t('common:email-placeholder')}
							aria-invalid={Boolean(errors.email?.message) || undefined}
							autoComplete="email"
							className="h-11 text-sm lg:h-10 lg:text-[13px]"
						/>
						{errors.email?.message ? (
							<p className="text-xs text-destructive">{errors.email.message}</p>
						) : null}
					</div>

					<PasswordField
						id="login-password"
						label={t('common:password')}
						register={register('password')}
						placeholder={t('enter-your-password')}
						required
						invalid={isPasswordInvalid}
						autoComplete="current-password"
						labelAdornment={
							<Link
								to="/reset-password"
								className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
							>
								{t('forgot-password')}?
							</Link>
						}
					/>
					{passwordFieldErrorMessage ? (
						<p className="text-xs text-destructive">
							{passwordFieldErrorMessage}
						</p>
					) : null}

					{errorMessage ? (
						<AuthAlert
							tone="danger"
							icon={<IconAlertCircle aria-hidden="true" />}
							testId="auth-login-error-alert"
						>
							{errorMessage}
						</AuthAlert>
					) : null}

					<Button
						type="submit"
						variant="default"
						disabled={isDisabled}
						className="h-12 w-full text-sm lg:h-11"
					>
						{isSubmitting ? (
							<IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
						) : null}
						{isSubmitting ? t('signing-in') : t('common:sign-in')}
					</Button>
				</fieldset>
			</form>
		</div>
	);
};

const LoginErrorBoundary = ({
	error,
	reset,
}: {
	error: unknown;
	reset: () => void;
}) => {
	const router = useRouter();
	const { t } = useTranslation(['auth', 'common']);
	const routeStatus = getFailureStatus(error);

	if (routeStatus === 401) {
		return (
			<AppErrorView
				icon={<IconLock aria-hidden="true" className="size-7" />}
				code={t('common:error-401-code')}
				title={t('common:authentication-required')}
				description={t('login-request-unauthorized-description')}
				testId="auth-401-view"
				actions={
					<Link to="/login" className={buttonVariants({ variant: 'default' })}>
						{t('common:back-to-login')}
					</Link>
				}
			/>
		);
	}

	if (routeStatus === 403) {
		return <View403 />;
	}

	if (routeStatus === 404) {
		return <View404 />;
	}

	const retry = () => {
		reset();
		void router.invalidate();
	};

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-500-code')}
			title={t('common:something-went-wrong')}
			description={t('sign-in-could-not-be-completed')}
			actions={
				<>
					<Button variant="default" onClick={retry} type="button">
						{t('common:retry')}
					</Button>
					<Link to="/" className={buttonVariants({ variant: 'outline' })}>
						{t('common:go-to-home')}
					</Link>
				</>
			}
		/>
	);
};

export const Route = createFileRoute('/login')({
	beforeLoad: redirectAuthenticatedUserAwayFromAuthPage,
	staticData: { i18nNamespaces: ['auth'], crumbs: 'shell' },
	component: LoginRoute,
	errorComponent: LoginErrorBoundary,
});
