import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
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
import { useHydrated } from '~/lib/hooks/use-hydrated';
import { register, requestEmailVerification } from '~/lib/server/auth-actions';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { PASSWORD_MIN_LENGTH } from '@org/shared-ts/lib/auth-password-policy';

type SignUpFormValues = {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

const getSignUpFormSchema = (t: Translate) =>
	z.object({
		firstName: z.string().trim().min(1, t('first-name-required')),
		lastName: z.string().trim().min(1, t('last-name-required')),
		email: z
			.string()
			.max(120)
			.pipe(z.email(t('enter-valid-email-address'))),
		password: z
			.string()
			.min(
				PASSWORD_MIN_LENGTH,
				t('password-min-length-hint-n', { characters: PASSWORD_MIN_LENGTH }),
			),
	});

/**
 * `/terms` and `/privacy` have no route in `src/routes.ts` yet — rendering
 * them as `<Link>` would fail to typecheck against the generated route tree,
 * and a raw `<a href>` would 404 on click. Plain, unlinked text until those
 * pages exist (product TODO), rather than shipping either failure mode.
 */
const SignUpTermsFooter = () => {
	const { t } = useTranslation(['auth', 'common']);

	return (
		<p className="text-center text-xs text-muted-foreground">
			{t('by-signing-up-agree')} {t('terms-of-service')} {t('and')}{' '}
			{t('privacy-policy')}.
		</p>
	);
};

const SignUpRoute = () => {
	const navigate = useNavigate();
	const { t } = useTranslation(['auth', 'common']);
	const [errorMessage, setErrorMessage] = useState('');
	const signupsEnabled = FEATURES.auth.signupsEnabled;
	const isHydrated = useHydrated();

	const registerAction = useServerFn(register);
	const requestEmailVerificationAction = useServerFn(requestEmailVerification);
	const formSchema = useMemo(() => getSignUpFormSchema(t), [t]);

	const {
		register: registerField,
		handleSubmit,
		setError,
		formState: { isSubmitting, errors },
	} = useForm<SignUpFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { firstName: '', lastName: '', email: '', password: '' },
	});

	const onSubmit = async (values: SignUpFormValues) => {
		setErrorMessage('');

		try {
			const result = await registerAction({
				data: {
					firstName: values.firstName,
					lastName: values.lastName,
					email: values.email,
					password: values.password,
				},
			});

			try {
				await requestEmailVerificationAction({ data: { email: result.email } });
			} catch {
				// Best-effort — the account is already created, don't block on this.
			}

			await navigate({ to: '/verify-email', search: { email: result.email } });
		} catch (error) {
			const failure = toApiFailure(error);

			if (failure.kind === 'validation') {
				const formFields: Array<keyof SignUpFormValues> = [
					'firstName',
					'lastName',
					'email',
					'password',
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

	const isDisabled = !isHydrated || !signupsEnabled || isSubmitting;

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
						<Link
							to="/login"
							className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-(--publy-primary-foreground)"
						>
							{t('log-in')}
						</Link>
					</>
				}
			/>

			<form
				onSubmit={handleSubmit(onSubmit)}
				method="post"
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
							{errors.firstName?.message ? (
								<p className="text-xs text-destructive">
									{errors.firstName.message}
								</p>
							) : null}
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
							{errors.lastName?.message ? (
								<p className="text-xs text-destructive">
									{errors.lastName.message}
								</p>
							) : null}
						</div>
					</div>

					<div className="space-y-1.5">
						<label
							htmlFor="signup-email"
							className="text-[13px] font-medium text-foreground"
						>
							{t('common:email-address')}
						</label>
						<Input
							{...registerField('email')}
							id="signup-email"
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
						id="signup-password"
						label={t('common:password')}
						register={registerField('password')}
						placeholder={t('common:min-characters-hint', {
							characters: PASSWORD_MIN_LENGTH,
						})}
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
	staticData: { i18nNamespaces: ['auth'], crumbs: 'shell' },
	component: SignUpRoute,
});
