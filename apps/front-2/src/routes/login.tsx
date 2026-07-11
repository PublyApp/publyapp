import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
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
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthAlert } from '~/components/auth/auth-alert';
import { AuthFormHeader } from '~/components/auth/auth-form-header';
import { PasswordField } from '~/components/auth/password-field';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { Button, buttonVariants } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { completeLoginRedirect, login } from '~/lib/server/session-actions';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

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

const resolveRouteRedirect = (path: string | null): string => {
	if (!path) {
		return '/';
	}

	if (!path.startsWith('/') || path.startsWith('//')) {
		return '/';
	}

	return path;
};

const getSafeSearchRedirect = (search: string): string => {
	const params = new URLSearchParams(search);
	return resolveRouteRedirect(params.get(queryParamKey.login_page.redirect_to));
};

const isAllowedRedirectPath = (
	requested: string,
	surfacePath: string,
): boolean => {
	if (!requested || !requested.startsWith('/')) {
		return false;
	}

	const normalizedSurface = surfacePath.replace(/\/$/, '');
	if (requested === normalizedSurface) {
		return true;
	}

	if (normalizedSurface === '/') {
		return true;
	}

	return requested.startsWith(`${normalizedSurface}/`);
};

const isSessionExpiredFromSearch = (search: string): boolean => {
	const params = new URLSearchParams(search);
	return (
		params.get(queryParamKey.login_page.redirect_cause) ===
		queryParamValue.login_page.redirect_cause.invalid_session
	);
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
	const { t } = useTranslation('common');
	const [showForbidden, setShowForbidden] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [invalidCredentialsMessage, setInvalidCredentialsMessage] =
		useState('');
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	const loginAction = useServerFn(login);
	const completeRedirect = useServerFn(completeLoginRedirect);
	const search = location.searchStr ?? '';
	const isSessionExpired = isSessionExpiredFromSearch(search);

	const loginFormSchema = useMemo(() => getLoginFormSchema(t), [t]);

	const {
		register,
		handleSubmit,
		setError,
		formState: { isSubmitting, errors },
	} = useForm<LoginFormValues>({
		resolver: zodResolver(loginFormSchema),
		defaultValues: {
			email: '',
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
				setError('email', {
					message:
						failure.fieldErrors.email?.[0] ??
						getFailureMessage(failure, {
							fallback: t('enter-valid-email-and-password'),
						}),
				});
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

			<AuthFormHeader
				title={isSessionExpired ? t('welcome-back') : t('sign-in')}
				secondary={
					isSessionExpired ? (
						t('sign-in-to-pick-up-where-you-left-off')
					) : (
						<>
							{t('no-account-yet')}{' '}
							<a
								href="/signup"
								className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-(--publy-primary-foreground)"
							>
								{t('create-one')}
							</a>
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
							{t('email-address')}
						</label>
						<Input
							{...register('email')}
							id="login-email"
							required
							type="email"
							placeholder={t('email-placeholder')}
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
						label={t('password')}
						register={register('password')}
						placeholder={t('enter-your-password')}
						required
						invalid={isPasswordInvalid}
						autoComplete="current-password"
						labelAdornment={
							<a
								href="/reset-password"
								className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
							>
								{t('forgot-password')}?
							</a>
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
						{isSubmitting ? t('signing-in') : t('sign-in')}
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
	const { t } = useTranslation('common');
	const routeStatus = getFailureStatus(error);

	if (routeStatus === 401) {
		return (
			<AppErrorView
				icon={<IconLock aria-hidden="true" className="size-7" />}
				code="401 — Unauthorized"
				title="Authentication required"
				description="Your login request could not be authorized. Please verify your credentials and try again."
				testId="auth-401-view"
				actions={
					<Button
						variant="default"
						onClick={() => {
							window.location.assign('/login');
						}}
					>
						Back to login
					</Button>
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
			code="500 — Server Error"
			title="Something went wrong"
			description="Sign-in could not be completed."
			actions={
				<>
					<Button variant="default" onClick={retry} type="button">
						{t('retry')}
					</Button>
					<Link to="/" className={buttonVariants({ variant: 'outline' })}>
						{t('go-to-home')}
					</Link>
				</>
			}
		/>
	);
};

export const Route = createFileRoute('/login')({
	component: LoginRoute,
	errorComponent: LoginErrorBoundary,
});
