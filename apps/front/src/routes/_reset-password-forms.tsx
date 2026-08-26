import { zodResolver } from '@hookform/resolvers/zod';
import {
	IconAlertCircle,
	IconArrowLeft,
	IconInfoCircle,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { AuthAlert } from '~/components/auth/auth-alert';
import { AuthFormHeader } from '~/components/auth/auth-form-header';
import { EmailSentConfirmation } from '~/components/auth/email-sent-confirmation';
import { PasswordField } from '~/components/auth/password-field';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { PASSWORD_MIN_LENGTH } from '@org/shared-ts/lib/auth-password-policy';
import { useHydrated } from '~/lib/hooks/use-hydrated';
import { requestPasswordReset, resetPassword } from '~/lib/server/auth-actions';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	getRequestFormSchema,
	getSetNewPasswordFormSchema,
	type RequestFormValues,
	type SetNewPasswordFormValues,
} from './_reset-password-form-schemas';
import { ResetPasswordSuccess } from './_reset-password-success';

export const ResetPasswordRequestForm = () => {
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

export const SetNewPasswordForm = ({
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
