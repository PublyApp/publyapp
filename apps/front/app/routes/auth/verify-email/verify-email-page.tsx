import { Field, Form } from '@/front/components/hook-form';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useLanguageTriggerValidation } from '@/front/hooks/use-language-trigger-validation';
import { useTranslate } from '@/front/hooks/use-translate';
import { safeRun } from '@/front/lib/react-router/safeRun';
import {
	getServerAction,
	getServerLoader,
} from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	FRONT_PATH_NAMES,
	X_CODE,
	queryParamKey,
	queryParamValue,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import { getErrorMessage } from '@/shared/utils/error-message';
import { decodeString } from '@/shared/utils/string-encoding.server';
import {
	getChallengeEmailForTokenSchema,
	getEmailFormSchema,
	getRequestEmailVerificationSchema,
} from '@/shared/validations/auth.validations';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, type Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { useForm } from 'react-hook-form';
import { redirect, useFetcher } from 'react-router';
import InvalidLinkView from '../components/invalid-link-view';
import type { Route } from './+types/verify-email-page';

const actionIntent = {
	REQUEST_EMAIL_VERIFICATION: 'REQUEST_EMAIL_VERIFICATION',
	// CHALLENGE_EMAIL_FOR_TOKEN: 'CHALLENGE_EMAIL_FOR_TOKEN',
} as const;

export const action = getServerAction({
	action: async ({ request, apiClient, context, z }) => {
		const formData = await request.formData();
		const intent = formData.get('intent');

		const email = formData.get('email');
		// const searchParams = new URL(request.url).searchParams;
		// const token = searchParams.get(queryParamKey.token);

		switch (intent) {
			case actionIntent.REQUEST_EMAIL_VERIFICATION: {
				const schema = getRequestEmailVerificationSchema(z);

				const parsed = schema.safeParse({ email });

				if (!parsed.success) {
					return {
						status: 'error',
						error: parsed.error.errors[0].message,
					} as const;
				}

				const verificationEmailRequest = safeRun(
					apiClient.auth.verificationEmailRequest,
				);

				// we intentionally don't return the actual outcome of the request
				verificationEmailRequest({ email: parsed.data.email }).then(
					(result) => {
						if (result.status === 'error') {
							context.logger.error(
								'Error when requesting email verification',
								result.error,
							);
						}
					},
				);

				return {
					status: 'success',
				} as const;
			}

			// case actionIntent.CHALLENGE_EMAIL_FOR_TOKEN: {
			// 	const schema = getChallengeEmailForTokenSchema(z);

			// 	const parsed = schema.safeParse({ email, token });

			// 	if (!parsed.success) {
			// 		return {
			// 			status: 'error',
			// 			error: parsed.error.errors[0].message,
			// 		} as const;
			// 	}

			// 	const challengeEmailForToken = safeRun(
			// 		apiClient.auth.challengeEmailForToken,
			// 	);

			// 	const result = await challengeEmailForToken({
			// 		email: parsed.data.email,
			// 		token: parsed.data.token,
			// 	});

			// 	if (result.status === 'error') {
			// 		return {
			// 			status: 'error',
			// 			error: result.error.message,
			// 		} as const;
			// 	}

			// 	const pathname = FRONT_PATH_NAMES.auth.resetPassword;
			// 	const searchParams = new URLSearchParams();
			// 	searchParams.set(
			// 		queryParamKey.reset_password_page.redirect_cause,
			// 		queryParamValue.reset_password_page.redirect_cause.email_verification,
			// 	);
			// 	searchParams.set(
			// 		queryParamKey.language,
			// 		getCorrectLocale(searchParams.get(queryParamKey.language)),
			// 	);
			// 	searchParams.set(
			// 		queryParamKey.reset_password_page.encoded_email,
			// 		encodeString(parsed.data.email),
			// 	);
			// 	return redirect(`${pathname}?${searchParams.toString()}`);
			// 	// break;
			// }

			default: {
				return {
					status: 'error',
					error: 'Invalid action intent',
				} as const;
			}
		}
	},
});

export const loader = getServerLoader({
	loader: async ({ request, apiClient }) => {
		const searchParams = new URL(request.url).searchParams;
		const token = searchParams.get(queryParamKey.token);
		const encodedEmail = searchParams.get(
			queryParamKey.reset_password_page.encoded_email,
		);

		// if no token, we just return success
		if (!token && !encodedEmail) {
			return {
				code: 'NO_TOKEN_AND_ID',
			} as const;
		}

		if (!token || !encodedEmail) {
			return {
				code: 'INVALID_LINK',
			} as const;
		}

		let isValidEncodedEmail = false;
		let decodedEmail = '';

		try {
			decodedEmail = decodeString(encodedEmail);
			isValidEncodedEmail = true;
		} catch (_error) {
			isValidEncodedEmail = false;
		}

		if (!isValidEncodedEmail) {
			return {
				code: 'INVALID_LINK',
			} as const;
		}

		const challengeEmailForToken = safeRun(
			apiClient.auth.challengeEmailForToken,
		);

		const schema = getChallengeEmailForTokenSchema(defaultZodClient);
		const parsed = schema.safeParse({ email: decodedEmail, token });

		// we don't tell what went wrong here
		// because we don't want to leak information
		// to potential attackers
		if (!parsed.success) {
			return {
				code: 'INVALID_LINK',
			} as const;
		}

		const result = await challengeEmailForToken({
			email: parsed.data.email,
			token: parsed.data.token,
		});

		if (result.status === 'error') {
			if (result.error instanceof ParseRestError) {
				if (result.error.code === X_CODE.INVALID_EMAIL_VERIFICATION_TOKEN) {
					return {
						code: 'INVALID_LINK',
					} as const;
				}

				throw new Response(result.error.message, {
					status: result.error.httpStatusCode,
				});
			}

			throw result.error;
		}

		const redirectSearchParams = new URLSearchParams();
		redirectSearchParams.set(
			queryParamKey.reset_password_page.redirect_cause,
			queryParamValue.reset_password_page.redirect_cause.email_verification,
		);
		redirectSearchParams.set(
			queryParamKey.language,
			getCorrectLocale(redirectSearchParams.get(queryParamKey.language)),
		);
		redirectSearchParams.set(
			queryParamKey.reset_password_page.encoded_email,
			encodedEmail,
		);
		redirectSearchParams.set(queryParamKey.token, result.data.token);
		return redirect(
			`${FRONT_PATH_NAMES.auth.resetPassword}?${redirectSearchParams.toString()}`,
		);
	},
});

const boxStyles = (theme: Theme) => {
	return {
		[theme.breakpoints.up('md')]: {
			mt: `-${theme.typography.pxToRem(300)}`,
		},
	};
};

const VerifyEmailPage = ({ loaderData }: Route.ComponentProps) => {
	if (loaderData.code === 'INVALID_LINK') {
		return (
			<Box sx={boxStyles}>
				<InvalidLinkView forceIsInvalid />
			</Box>
		);
	}

	return (
		<Box sx={boxStyles}>
			<EmailForForm intent={actionIntent.REQUEST_EMAIL_VERIFICATION} />
		</Box>
	);
};

export default VerifyEmailPage;

const EmailForForm = ({ intent }: { intent: keyof typeof actionIntent }) => {
	const { t, i18n } = useTranslate();

	const schema = getEmailFormSchema(defaultZodClient);

	const formText = {
		[actionIntent.REQUEST_EMAIL_VERIFICATION]: {
			title: t('verify-email'),
			description: t('verify-email-description-1'),
		},
		// [actionIntent.CHALLENGE_EMAIL_FOR_TOKEN]: {
		// 	title: t('verify-email'),
		// 	description: t('verify-email-description-2'),
		// },
	};

	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			email: '',
		},
	});

	const {
		formState: { isSubmitting },
	} = form;

	useLanguageTriggerValidation(i18n.language, form);

	const fetcher = useFetcher<typeof action>();

	const errorFetcher = fetcher.data?.error;
	const errorMessage = errorFetcher ? getErrorMessage(errorFetcher) : null;

	const handleSubmit = form.handleSubmit(async (data) => {
		await fetcher.submit(
			{
				...data,
				intent,
			},
			{
				method: 'post',
			},
		);
	});

	if (fetcher.data?.status === 'success') {
		return (
			<Box>
				<Typography variant="h5" color="text.primary" sx={{ mb: 2 }}>
					{t('verify-email-request-sent')}
				</Typography>
				<Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
					{t('verify-email-request-sent-description-part1')}
					<Typography component="span" sx={{ fontWeight: 'bold' }}>
						{form.getValues().email}
					</Typography>
					{t('verify-email-request-sent-description-part2')}
				</Typography>
				<Button
					component={RouterLink}
					href={FRONT_PATH_NAMES.home}
					variant="text"
					color="primary"
					endIcon={<Iconify icon="eva:arrow-forward-fill" />}
				>
					{t('go-to-home')}
				</Button>
			</Box>
		);
	}

	return (
		<>
			{!!errorMessage && (
				<Alert severity="error" sx={{ mb: 3 }}>
					{errorMessage}
				</Alert>
			)}
			<Form methods={form} onSubmit={handleSubmit}>
				<Typography variant="h5" color="text.primary" sx={{ mb: 2 }}>
					{formText[intent].title}
				</Typography>
				<Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
					{formText[intent].description}
				</Typography>
				<Field.Text
					name="email"
					label={t('email-address')}
					slotProps={{ inputLabel: { shrink: true } }}
				/>
				<Button
					fullWidth
					size="large"
					type="submit"
					variant="contained"
					sx={{ mt: 3 }}
					loading={isSubmitting}
					loadingIndicator={`${t('verify-email')}...`}
				>
					{t('verify-email')}
				</Button>
			</Form>
		</>
	);
};
