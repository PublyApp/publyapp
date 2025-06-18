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
} from '@/shared/lib/constants';
import { getErrorMessage } from '@/shared/utils/error-message';
import { getRequestEmailVerificationSchema } from '@/shared/validations/auth.validations';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, type Theme } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { useForm } from 'react-hook-form';
import { useFetcher } from 'react-router';
import type { Route } from './+types/verify-email-page';

export const action = getServerAction({
	action: async ({ request, apiClient, context, z }) => {
		const formData = await request.formData();
		const email = formData.get('email');

		const schema = getRequestEmailVerificationSchema(z);

		const parsed = schema.safeParse({ email });

		if (!parsed.success) {
			return {
				status: 'error',
				error: parsed.error.errors[0].message,
			};
		}

		const verificationEmailRequest = safeRun(
			apiClient.auth.verificationEmailRequest,
		);

		// we intentionally don't return the actual outcome of the request
		verificationEmailRequest({ email: parsed.data.email }).then((result) => {
			if (result.status === 'error') {
				(context.logger || console)?.error(
					'Error when requesting email verification',
					result.error,
				);
			}
		});

		return {
			status: 'success',
		};
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
				<VerifyEmailRequestForm />
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
			<VerifyEmailRequestForm />
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

const VerifyEmailRequestForm = () => {
	const { t } = useTranslate();

	const schema = getRequestEmailVerificationSchema(defaultZodClient);

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
		await fetcher.submit(data, {
			method: 'post',
		});
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
					{t('verify-email')}
				</Typography>
				<Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
					{t('verify-email-description-1')}
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
