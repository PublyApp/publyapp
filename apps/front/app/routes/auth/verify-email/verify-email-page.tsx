import { Field, Form } from '@/front/components/hook-form';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
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
import { getErrorMessage } from '@/shared/utils/error-message';
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
import type { Route } from './+types/verify-email-page';

const actionIntent = {
	REQUEST_EMAIL_VERIFICATION: 'REQUEST_EMAIL_VERIFICATION',
	CHALLENGE_EMAIL_FOR_TOKEN: 'CHALLENGE_EMAIL_FOR_TOKEN',
} as const;

export const action = getServerAction({
	action: async ({ request, apiClient, context, z }) => {
		const formData = await request.formData();
		const intent = formData.get('intent');

		const email = formData.get('email');
		const searchParams = new URL(request.url).searchParams;
		const token = searchParams.get(queryParamKey.token);

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
							(context.logger || console)?.error(
								'Error when requesting email verification',
								result.error,
							);
						}
					},
				);

				return {
					status: 'success',
				} as const;
				// break;
			}

			case actionIntent.CHALLENGE_EMAIL_FOR_TOKEN: {
				const schema = getChallengeEmailForTokenSchema(z);

				const parsed = schema.safeParse({ email, token });

				if (!parsed.success) {
					return {
						status: 'error',
						error: parsed.error.errors[0].message,
					} as const;
				}

				const challengeEmailForToken = safeRun(
					apiClient.auth.challengeEmailForToken,
				);

				const result = await challengeEmailForToken({
					email: parsed.data.email,
					token: parsed.data.token,
				});

				if (result.status === 'error') {
					return {
						status: 'error',
						error: result.error.message,
					} as const;
				}

				const url = new URL(FRONT_PATH_NAMES.auth.login);
				url.searchParams.set(
					queryParamKey.login_page.redirect_cause,
					queryParamValue.login_page.redirect_cause.email_verification,
				);
				return redirect(url.toString());
				// break;
			}

			default:
				return {
					status: 'error',
					error: 'Invalid action intent',
				} as const;
		}
	},
});

export const loader = getServerLoader({
	loader: async ({ request, apiClient }) => {
		const searchParams = new URL(request.url).searchParams;
		const token = searchParams.get(queryParamKey.token);

		// if no token, we just return success
		if (!token) {
			return {
				code: 'NO_TOKEN',
			} as const;
		}

		const checkEmailVerificationToken = safeRun(
			apiClient.auth.checkEmailVerificationToken,
		);

		const result = await checkEmailVerificationToken({ token });

		if (result.status === 'error') {
			if (result.error instanceof ParseRestError) {
				if (result.error.code === X_CODE.INVALID_TOKEN) {
					return {
						code: 'INVALID_TOKEN',
					} as const;
				}

				throw new Response(result.error.message, {
					status: result.error.httpStatusCode,
				});
			}

			throw result.error;
		}

		return {
			code: 'OK',
		} as const;
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
	if (loaderData.code === 'NO_TOKEN') {
		return (
			<Box sx={boxStyles}>
				<EmailForForm intent={actionIntent.REQUEST_EMAIL_VERIFICATION} />
			</Box>
		);
	}

	if (loaderData.code === 'INVALID_TOKEN') {
		return (
			<Box sx={boxStyles}>
				<InvalidTokenView forceIsInvalid />
			</Box>
		);
	}

	return (
		<Box sx={boxStyles}>
			<EmailForForm intent={actionIntent.CHALLENGE_EMAIL_FOR_TOKEN} />
		</Box>
	);
};

export default VerifyEmailPage;

const InvalidTokenView = ({
	error,
	forceIsInvalid = false,
}: { error?: unknown; forceIsInvalid?: boolean }) => {
	const { t } = useTranslate();

	const renderInvalidTokenView = () => {
		return (
			<Box>
				<Typography variant="h4" color="text.primary" mb={2}>
					{t('invalid-item', { item: t('link') })}
				</Typography>
				<Typography variant="body1" color="text.secondary" mb={3}>
					{t('invalid-email-verification-link-description')}
				</Typography>
				<Button
					component={RouterLink}
					href={FRONT_PATH_NAMES.home}
					variant="text"
					color="primary"
					endIcon={<Iconify icon="eva:arrowhead-right-fill" />}
				>
					{t('go-to-home')}
				</Button>
			</Box>
		);
	};

	if (!forceIsInvalid && _.isNil(error)) {
		throw new Error('Error should not be nil');
	}

	if (forceIsInvalid) {
		return renderInvalidTokenView();
	}

	if (error instanceof ParseRestError) {
		if (error.code === X_CODE.INVALID_TOKEN) {
			return renderInvalidTokenView();
		}
	}

	throw error;
};

const EmailForForm = ({ intent }: { intent: keyof typeof actionIntent }) => {
	const { t } = useTranslate();

	const schema = getEmailFormSchema(defaultZodClient);

	const formText = {
		[actionIntent.REQUEST_EMAIL_VERIFICATION]: {
			title: t('verify-email'),
			description: t('verify-email-description-1'),
		},
		[actionIntent.CHALLENGE_EMAIL_FOR_TOKEN]: {
			title: t('verify-email'),
			description: t('verify-email-description-2'),
		},
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
					endIcon={<Iconify icon="eva:arrowhead-right-fill" />}
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
