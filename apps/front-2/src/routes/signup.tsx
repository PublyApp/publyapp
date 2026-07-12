import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthAlert } from '~/components/auth/auth-alert';
import { AuthFormHeader } from '~/components/auth/auth-form-header';
import { PasswordField } from '~/components/auth/password-field';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { redirectAuthenticatedUserAwayFromAuthPage } from '~/lib/auth-route-guard';
import { FEATURES } from '~/lib/flags';
import { register, requestEmailVerification } from '~/lib/server/auth-actions';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

type SignUpFormValues = {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
};

type Translate = (key: string) => string;

const getSignUpFormSchema = (t: Translate) =>
	z.object({
		firstName: z.string().min(1, t('first-name-required')),
		lastName: z.string().min(1, t('last-name-required')),
		email: z.string().max(120).email(t('enter-valid-email-address')),
		password: z.string().min(8, t('password-min-length-hint')),
	});

const SignUpTermsFooter = () => {
	const { t } = useTranslation('common');

	return (
		<p className="text-center text-xs text-muted-foreground">
			{t('by-signing-up-agree')}{' '}
			<a
				href="/terms"
				className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-(--publy-primary-foreground)"
			>
				{t('terms-of-service')}
			</a>{' '}
			{t('and')}{' '}
			<a
				href="/privacy"
				className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-(--publy-primary-foreground)"
			>
				{t('privacy-policy')}
			</a>
			.
		</p>
	);
};

const SignUpRoute = () => {
	const navigate = useNavigate();
	const { t } = useTranslation('common');
	const [errorMessage, setErrorMessage] = useState('');
	const signupsEnabled = FEATURES.auth.signupsEnabled;

	const registerAction = useServerFn(register);
	const requestEmailVerificationAction = useServerFn(requestEmailVerification);
	const formSchema = useMemo(() => getSignUpFormSchema(t), [t]);

	const {
		register: registerField,
		handleSubmit,
		formState: { isSubmitting, errors },
	} = useForm<SignUpFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { firstName: '', lastName: '', email: '', password: '' },
	});

	const onSubmit = async (values: SignUpFormValues) => {
		setErrorMessage('');

		try {
			const result = await registerAction({
				data: { email: values.email, password: values.password },
			});

			try {
				await requestEmailVerificationAction({ data: { email: result.email } });
			} catch {
				// Best-effort — the account is already created, don't block on this.
			}

			await navigate({ to: '/verify-email', search: { email: result.email } });
		} catch (error) {
			const failure = toApiFailure(error);
			setErrorMessage(
				getFailureMessage(failure, { fallback: t('an-error-occurred') }),
			);
		}
	};

	const isDisabled = !signupsEnabled || isSubmitting;

	return (
		<div className="space-y-6">
			{!signupsEnabled ? (
				<AuthAlert
					tone="blue"
					icon={<IconInfoCircle aria-hidden="true" />}
					testId="signup-closed-alert"
				>
					{t('signup-closed-notice')}
				</AuthAlert>
			) : null}

			<AuthFormHeader
				title={t('create-your-account')}
				secondary={
					<>
						{t('already-have-account-question')}{' '}
						<a
							href="/login"
							className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-(--publy-primary-foreground)"
						>
							{t('log-in')}
						</a>
					</>
				}
			/>

			<form
				onSubmit={handleSubmit(onSubmit)}
				className="space-y-4"
				data-testid="signup-form"
			>
				<fieldset disabled={isDisabled} className="m-0 space-y-4 border-0 p-0">
					{errorMessage ? (
						<AuthAlert
							tone="danger"
							icon={<IconAlertCircle aria-hidden="true" />}
							testId="signup-error-alert"
						>
							{errorMessage}
						</AuthAlert>
					) : null}

					<div className="flex flex-col gap-4 sm:flex-row">
						<div className="flex-1 space-y-1.5">
							<label
								htmlFor="signup-first-name"
								className="text-[13px] font-medium text-foreground"
							>
								{t('auth-first-name')}
							</label>
							<Input
								{...registerField('firstName')}
								id="signup-first-name"
								required
								placeholder={t('auth-first-name')}
								aria-invalid={Boolean(errors.firstName?.message) || undefined}
								autoComplete="given-name"
								className="h-11 text-sm lg:h-10 lg:text-[13px]"
							/>
						</div>
						<div className="flex-1 space-y-1.5">
							<label
								htmlFor="signup-last-name"
								className="text-[13px] font-medium text-foreground"
							>
								{t('auth-last-name')}
							</label>
							<Input
								{...registerField('lastName')}
								id="signup-last-name"
								required
								placeholder={t('auth-last-name')}
								aria-invalid={Boolean(errors.lastName?.message) || undefined}
								autoComplete="family-name"
								className="h-11 text-sm lg:h-10 lg:text-[13px]"
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label
							htmlFor="signup-email"
							className="text-[13px] font-medium text-foreground"
						>
							{t('email-address')}
						</label>
						<Input
							{...registerField('email')}
							id="signup-email"
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
						id="signup-password"
						label={t('password')}
						register={registerField('password')}
						placeholder={t('n+ characters', { characters: '8' })}
						required
						invalid={Boolean(errors.password?.message)}
						autoComplete="new-password"
					/>
					{errors.password?.message ? (
						<p className="text-xs text-destructive">
							{errors.password.message}
						</p>
					) : null}

					<Button
						type="submit"
						variant="default"
						disabled={isDisabled}
						className="h-12 w-full text-sm lg:h-11"
					>
						{t('create-account')}
					</Button>
				</fieldset>
			</form>

			<SignUpTermsFooter />
		</div>
	);
};

export const Route = createFileRoute('/signup')({
	beforeLoad: redirectAuthenticatedUserAwayFromAuthPage,
	component: SignUpRoute,
});
