import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import {
	createFileRoute,
	Link,
	redirect,
	useLoaderData,
} from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthAlert } from '~/components/auth/auth-alert';
import { AuthFormHeader } from '~/components/auth/auth-form-header';
import { EmailSentConfirmation } from '~/components/auth/email-sent-confirmation';
import { InvalidLinkView } from '~/components/auth/invalid-link-view';
import { PrecheckUnavailableView } from '~/components/auth/precheck-unavailable-view';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { redirectAuthenticatedUserAwayFromAuthPage } from '~/lib/auth-route-guard';
import { buildSafeResetPasswordHref } from '~/lib/build-safe-reset-password-href';
import { useHydrated } from '~/lib/hooks/use-hydrated';
import {
	checkEmailVerificationToken,
	requestEmailVerification,
} from '~/lib/server/auth-actions';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { queryParamKey } from '@org/shared-ts/lib/constants';

type VerifyEmailLoaderData =
	| { view: 'invalid' }
	| { view: 'unavailable' }
	| { view: 'sent'; email: string }
	| { view: 'request' };

const verifyEmailLoader = async ({
	location,
}: {
	location: { searchStr: string };
}): Promise<VerifyEmailLoaderData> => {
	const params = new URLSearchParams(location.searchStr ?? '');
	const id = params.get(queryParamKey.reset_password_page.encoded_email);
	const token = params.get(queryParamKey.token);

	if (id && token) {
		const result = await checkEmailVerificationToken({ data: { id, token } });
		if (!result.ok) {
			return {
				view: result.reason === 'unavailable' ? 'unavailable' : 'invalid',
			};
		}

		throw redirect({
			href: buildSafeResetPasswordHref(result.resetPasswordUrl),
			replace: true,
			reloadDocument: true,
		});
	}

	const email = params.get(queryParamKey.login_page.email);
	if (email) {
		return { view: 'sent', email };
	}

	return { view: 'request' };
};

type VerifyEmailFormValues = {
	email: string;
};

type Translate = (key: string) => string;

const getVerifyEmailFormSchema = (t: Translate) =>
	z.object({
		email: z.string().max(120).email(t('enter-valid-email-address')),
	});

const VerifyEmailRoute = () => {
	const loaderData = useLoaderData({
		from: '/verify-email',
	}) as VerifyEmailLoaderData;
	const { t } = useTranslation(['auth', 'common']);
	// Only records a submit-triggered "sent" transition — the loader-derived
	// view is the source of truth otherwise, so a same-route navigation (the
	// loader re-running with a different search) isn't stuck showing a stale
	// confirmation for an email the user never actually just submitted (the
	// same never-resyncs shape F3 fixed in reset-password.tsx).
	const [locallySubmittedEmail, setLocallySubmittedEmail] = useState<
		string | null
	>(null);
	const [errorMessage, setErrorMessage] = useState('');
	const isHydrated = useHydrated();

	useEffect(() => {
		setLocallySubmittedEmail(null);
	}, [loaderData]);

	const submittedEmail =
		locallySubmittedEmail ??
		(loaderData.view === 'sent' ? loaderData.email : null);

	const requestEmailVerificationAction = useServerFn(requestEmailVerification);
	const formSchema = useMemo(() => getVerifyEmailFormSchema(t), [t]);

	const {
		register,
		handleSubmit,
		formState: { isSubmitting, errors },
	} = useForm<VerifyEmailFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { email: '' },
	});

	if (loaderData.view === 'unavailable') {
		return (
			<PrecheckUnavailableView testId="verify-email-precheck-unavailable-view" />
		);
	}

	if (loaderData.view === 'invalid') {
		return (
			<InvalidLinkView
				description={t('invalid-verification-link-description')}
				requestNewLinkHref="/verify-email"
				testId="verify-email-invalid-link-view"
			/>
		);
	}

	if (submittedEmail) {
		return (
			<EmailSentConfirmation
				title={t('verification-email-sent')}
				description={
					<Trans
						i18nKey="verify-email-sent-description"
						ns="auth"
						values={{ email: submittedEmail }}
						components={{ strong: <strong className="text-foreground" /> }}
					/>
				}
				hint={t('verify-email-sent-hint')}
				testId="verify-email-sent"
			/>
		);
	}

	const onSubmit = async (values: VerifyEmailFormValues) => {
		setErrorMessage('');

		try {
			await requestEmailVerificationAction({ data: { email: values.email } });
			setLocallySubmittedEmail(values.email);
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
			<AuthFormHeader title={t('verify-your-email')} />
			<p className="-mt-4 text-sm text-muted-foreground">
				{t('verify-your-email-description')}
			</p>

			<form
				onSubmit={handleSubmit(onSubmit)}
				method="post"
				className="space-y-4"
				data-testid="verify-email-request-form"
			>
				<fieldset
					disabled={!isHydrated || isSubmitting}
					className="m-0 space-y-4 border-0 p-0"
				>
					{errorMessage ? (
						<AuthAlert
							tone="danger"
							icon={<IconAlertCircle aria-hidden="true" />}
							testId="verify-email-error-alert"
						>
							{errorMessage}
						</AuthAlert>
					) : null}

					<div className="space-y-1.5">
						<label
							htmlFor="verify-email-email"
							className="text-[13px] font-medium text-foreground"
						>
							{t('common:email-address')}
						</label>
						<Input
							{...register('email')}
							id="verify-email-email"
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
						{t('verify-email')}
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

export const Route = createFileRoute('/verify-email')({
	beforeLoad: redirectAuthenticatedUserAwayFromAuthPage,
	staticData: { i18nNamespaces: ['auth'], crumbs: 'shell' },
	loader: verifyEmailLoader,
	component: VerifyEmailRoute,
});
