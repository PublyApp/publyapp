import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
	IconArrowLeft,
	IconArrowRight,
	IconCircleCheck,
	IconInfoCircle,
} from '@tabler/icons-react';
import { createFileRoute, Link, useLoaderData } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthAlert } from '~/components/auth/auth-alert';
import { AuthFormHeader } from '~/components/auth/auth-form-header';
import { EmailSentConfirmation } from '~/components/auth/email-sent-confirmation';
import { InvalidLinkView } from '~/components/auth/invalid-link-view';
import { PasswordField } from '~/components/auth/password-field';
import { PrecheckUnavailableView } from '~/components/auth/precheck-unavailable-view';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { Input } from '~/components/ui/input';
import { redirectAuthenticatedUserAwayFromAuthPage } from '~/lib/auth-route-guard';
import { useHydrated } from '~/lib/hooks/use-hydrated';
import {
	checkResetPasswordToken,
	requestPasswordReset,
	resetPassword,
} from '~/lib/server/auth-actions';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { PASSWORD_MIN_LENGTH } from '@org/shared-ts/lib/auth-password-policy';
import { queryParamKey, queryParamValue } from '@org/shared-ts/lib/constants';

type ResetPasswordLoaderData =
	| { view: 'invalid' }
	| { view: 'unavailable' }
	| { view: 'request' }
	| {
			view: 'set-new';
			id: string;
			token: string;
			email: string;
			fromEmailVerification: boolean;
	  };

const resetPasswordLoader = async ({
	location,
}: {
	location: { searchStr: string };
}): Promise<ResetPasswordLoaderData> => {
	const params = new URLSearchParams(location.searchStr ?? '');
	const id = params.get(queryParamKey.reset_password_page.encoded_email);
	const token = params.get(queryParamKey.token);

	if (!id || !token) {
		return { view: 'request' };
	}

	const result = await checkResetPasswordToken({ data: { id, token } });
	if (!result.ok) {
		return {
			view: result.reason === 'unavailable' ? 'unavailable' : 'invalid',
		};
	}

	const fromEmailVerification =
		params.get(queryParamKey.reset_password_page.redirect_cause) ===
		queryParamValue.reset_password_page.redirect_cause.email_verification;

	return {
		view: 'set-new',
		id,
		token,
		email: result.email,
		fromEmailVerification,
	};
};

type RequestFormValues = { email: string };
type SetNewPasswordFormValues = {
	newPassword: string;
	confirmPassword: string;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

const getRequestFormSchema = (t: Translate) =>
	z.object({
		email: z.string().max(120).email(t('enter-valid-email-address')),
	});

const getSetNewPasswordFormSchema = (t: Translate) =>
	z
		.object({
			newPassword: z
				.string()
				.min(
					PASSWORD_MIN_LENGTH,
					t('password-min-length-hint-n', { characters: PASSWORD_MIN_LENGTH }),
				),
			confirmPassword: z.string().min(1, t('password-is-required')),
		})
		.refine((data) => data.newPassword === data.confirmPassword, {
			message: t('passwords-do-not-match'),
			path: ['confirmPassword'],
		});

const ResetPasswordSuccess = () => {
	const { t } = useTranslation(['auth', 'common']);

	return (
		<div className="space-y-6 text-center" data-testid="reset-password-success">
			<div
				className="publy-state-icon-cluster mx-auto"
				data-tone="primary"
				aria-hidden="true"
			>
				<div className="publy-state-icon" data-tone="primary">
					<IconCircleCheck aria-hidden="true" className="size-7" />
				</div>
			</div>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-[-0.01em] text-foreground">
					{t('password-reset-title')}
				</h1>
				<p className="text-sm text-muted-foreground">
					{t('password-reset-success-description')}
				</p>
			</div>
			<Link
				to="/login"
				search={{
					[queryParamKey.login_page.redirect_cause]:
						queryParamValue.login_page.redirect_cause.password_reset_success,
				}}
				className={buttonVariants({ variant: 'default' })}
			>
				{t('back-to-sign-in')}
				<IconArrowRight aria-hidden="true" className="size-4" />
			</Link>
		</div>
	);
};

const ResetPasswordRequestForm = () => {
	const { t } = useTranslation(['auth', 'common']);
	const [submitted, setSubmitted] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const isHydrated = useHydrated();
	const requestPasswordResetAction = useServerFn(requestPasswordReset);
	const formSchema = useMemo(() => getRequestFormSchema(t), [t]);

	const {
		register,
		handleSubmit,
		getValues,
		formState: { isSubmitting, errors },
	} = useForm<RequestFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { email: '' },
	});

	if (submitted) {
		const email = getValues('email');
		return (
			<EmailSentConfirmation
				title={t('reset-link-sent-title')}
				description={
					<Trans
						i18nKey="reset-link-sent-description"
						ns="auth"
						values={{ email }}
						components={{ strong: <strong className="text-foreground" /> }}
					/>
				}
				testId="reset-password-request-sent"
			/>
		);
	}

	const onSubmit = async (values: RequestFormValues) => {
		setErrorMessage('');

		try {
			await requestPasswordResetAction({ data: { email: values.email } });
			setSubmitted(true);
		} catch (error) {
			const failure = toApiFailure(error);
			setErrorMessage(
				getFailureMessage(failure, {
					fallback: t('common:an-error-occurred'),
				}),
			);
		}
	};

	return (
		<div className="space-y-6">
			<AuthFormHeader title={t('reset-your-password')} />
			<p className="-mt-4 text-sm text-muted-foreground">
				{t('reset-password-request-description')}
			</p>

			<form
				onSubmit={handleSubmit(onSubmit)}
				method="post"
				className="space-y-4"
				data-testid="reset-password-request-form"
			>
				<fieldset
					disabled={!isHydrated || isSubmitting}
					className="m-0 space-y-4 border-0 p-0"
				>
					{errorMessage ? (
						<AuthAlert
							tone="danger"
							icon={<IconAlertCircle aria-hidden="true" />}
							testId="reset-password-request-error-alert"
						>
							{errorMessage}
						</AuthAlert>
					) : null}

					<div className="space-y-1.5">
						<label
							htmlFor="reset-password-email"
							className="text-[13px] font-medium text-foreground"
						>
							{t('common:email-address')}
						</label>
						<Input
							{...register('email')}
							id="reset-password-email"
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

					<Button
						type="submit"
						variant="default"
						disabled={!isHydrated || isSubmitting}
						className="h-12 w-full text-sm lg:h-11"
					>
						{t('send-reset-link')}
					</Button>
				</fieldset>
			</form>

			<div className="text-center">
				<Link
					to="/login"
					className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
				>
					<IconArrowLeft aria-hidden="true" className="size-3.5" />
					{t('back-to-sign-in')}
				</Link>
			</div>
		</div>
	);
};

const SetNewPasswordForm = ({
	id,
	token,
	email,
	fromEmailVerification,
	onInvalidToken,
}: {
	id: string;
	token: string;
	email: string;
	fromEmailVerification: boolean;
	onInvalidToken: () => void;
}) => {
	const { t } = useTranslation(['auth', 'common']);
	const [success, setSuccess] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const isHydrated = useHydrated();
	const resetPasswordAction = useServerFn(resetPassword);
	const formSchema = useMemo(() => getSetNewPasswordFormSchema(t), [t]);

	const {
		register,
		handleSubmit,
		setError,
		formState: { isSubmitting, errors },
	} = useForm<SetNewPasswordFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { newPassword: '', confirmPassword: '' },
	});

	if (success) {
		return <ResetPasswordSuccess />;
	}

	const onSubmit = async (values: SetNewPasswordFormValues) => {
		setErrorMessage('');

		try {
			await resetPasswordAction({
				data: {
					id,
					token,
					newPassword: values.newPassword,
					confirmPassword: values.confirmPassword,
				},
			});
			setSuccess(true);
		} catch (error) {
			const failure = toApiFailure(error);
			if (failure.kind === 'problem' && failure.status === 400) {
				onInvalidToken();
				return;
			}

			if (failure.kind === 'validation') {
				const formFields: Array<keyof SetNewPasswordFormValues> = [
					'newPassword',
					'confirmPassword',
				];
				let mappedToField = false;
				for (const field of formFields) {
					const message = failure.fieldErrors[field]?.[0];
					if (message) {
						setError(field, { message });
						mappedToField = true;
					}
				}
				if (!mappedToField) {
					setErrorMessage(
						getFailureMessage(failure, {
							fallback: t('common:an-error-occurred'),
						}),
					);
				}
				return;
			}

			setErrorMessage(
				getFailureMessage(failure, {
					fallback: t('common:an-error-occurred'),
				}),
			);
		}
	};

	const isDisabled = !isHydrated || isSubmitting;

	return (
		<div className="space-y-6">
			<AuthFormHeader title={t('set-a-new-password')} />
			<p className="-mt-4 text-sm text-muted-foreground">
				<Trans
					i18nKey="reset-password-description"
					ns="auth"
					values={{ email }}
					components={{ strong: <strong className="text-foreground" /> }}
				/>
			</p>

			{fromEmailVerification ? (
				<AuthAlert
					tone="amber"
					icon={<IconInfoCircle aria-hidden="true" />}
					testId="reset-password-email-verified-alert"
				>
					{t('email-verification-success')}
				</AuthAlert>
			) : null}

			<form
				onSubmit={handleSubmit(onSubmit)}
				method="post"
				className="space-y-4"
				data-testid="reset-password-set-new-form"
			>
				<fieldset disabled={isDisabled} className="m-0 space-y-4 border-0 p-0">
					{errorMessage ? (
						<AuthAlert
							tone="danger"
							icon={<IconAlertCircle aria-hidden="true" />}
							testId="reset-password-set-new-error-alert"
						>
							{errorMessage}
						</AuthAlert>
					) : null}

					<div>
						<PasswordField
							id="reset-password-new-password"
							label={t('new-password')}
							register={register('newPassword')}
							required
							invalid={Boolean(errors.newPassword?.message)}
							autoComplete="new-password"
						/>
						<p className="mt-1.5 text-xs text-muted-foreground">
							{t('password-min-length-hint-n', {
								characters: PASSWORD_MIN_LENGTH,
							})}
						</p>
						{errors.newPassword?.message ? (
							<p className="text-xs text-destructive">
								{errors.newPassword.message}
							</p>
						) : null}
					</div>

					<div>
						<PasswordField
							id="reset-password-confirm-password"
							label={t('confirm-password')}
							register={register('confirmPassword')}
							required
							invalid={Boolean(errors.confirmPassword?.message)}
							autoComplete="new-password"
						/>
						{errors.confirmPassword?.message ? (
							<p className="text-xs text-destructive">
								{errors.confirmPassword.message}
							</p>
						) : null}
					</div>

					<Button
						type="submit"
						variant="default"
						disabled={isDisabled}
						className="h-12 w-full text-sm lg:h-11"
					>
						{t('reset-password')}
					</Button>
				</fieldset>
			</form>
		</div>
	);
};

const ResetPasswordRoute = () => {
	const loaderData = useLoaderData({
		from: '/reset-password',
	}) as ResetPasswordLoaderData;
	const { t } = useTranslation(['auth', 'common']);
	// Models only the mid-submit token rejection (`onInvalidToken`) — the
	// loader-derived view below is the source of truth otherwise, so a
	// same-route "Request a new link" navigation (which re-runs the loader
	// but does not remount this component) still reaches the request form
	// instead of getting stuck on "Invalid link" forever (see F3).
	const [tokenRejected, setTokenRejected] = useState(false);

	useEffect(() => {
		setTokenRejected(false);
	}, [loaderData]);

	const view = tokenRejected ? 'invalid' : loaderData.view;

	if (view === 'unavailable') {
		return (
			<PrecheckUnavailableView testId="reset-password-precheck-unavailable-view" />
		);
	}

	if (view === 'invalid') {
		return (
			<InvalidLinkView
				description={t('invalid-reset-link-description')}
				requestNewLinkHref="/reset-password"
				testId="reset-password-invalid-link-view"
			/>
		);
	}

	if (view === 'set-new' && loaderData.view === 'set-new') {
		return (
			<SetNewPasswordForm
				id={loaderData.id}
				token={loaderData.token}
				email={loaderData.email}
				fromEmailVerification={loaderData.fromEmailVerification}
				onInvalidToken={() => setTokenRejected(true)}
			/>
		);
	}

	return <ResetPasswordRequestForm />;
};

export const Route = createFileRoute('/reset-password')({
	beforeLoad: redirectAuthenticatedUserAwayFromAuthPage,
	staticData: { i18nNamespaces: ['auth'], crumbs: 'shell' },
	loader: resetPasswordLoader,
	component: ResetPasswordRoute,
});
