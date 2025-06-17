import { Field, Form } from '@/front/components/hook-form';
import { Iconify } from '@/front/components/iconify/iconify';
import QueryDisplay from '@/front/components/query-display';
import { RouterLink } from '@/front/components/router-link';
import { useTranslate } from '@/front/hooks/use-translate';
import { useCheckEmailVerificationToken } from '@/front/lib/react-query/features/auth/auth.hooks';
import { safeRun } from '@/front/lib/react-router/safeRun';
import { getServerAction } from '@/front/lib/react-router/server-data.server';
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
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { useForm } from 'react-hook-form';
import { useFetcher, useSearchParams } from 'react-router';

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

const boxStyles = (theme: Theme) => {
	return {
		[theme.breakpoints.up('md')]: {
			mt: `-${theme.typography.pxToRem(300)}`,
		},
	};
};

const VerifyEmailPage = () => {
	const { t } = useTranslate();
	const [searchParams] = useSearchParams();

	const token = searchParams.get(queryParamKey.token);

	const checkTokenQuery = useCheckEmailVerificationToken({
		variables: { token: token ?? '' },
		enabled: !!token,
	});

	if (!token) {
		return (
			<Box sx={boxStyles}>
				<VerifyEmailRequestForm />
			</Box>
		);
	}

	return (
		<Box sx={boxStyles}>
			<QueryDisplay
				query={checkTokenQuery}
				LoadingSlot={LoadingFormView}
				ErrorSlot={InvalidTokenView}
			>
				<Box>
					<Typography variant="h5" color="text.primary" sx={{ mb: 2 }}>
						{t('verify-email')}
					</Typography>
					<Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
						{t('verify-email-description-2')}
					</Typography>
					<Box sx={{ mt: 3 }}>
						<TextField
							fullWidth
							label={t('email-address')}
							type="email"
							name="email"
							autoComplete="email"
							required
						/>
						<Button
							fullWidth
							size="large"
							type="submit"
							variant="contained"
							sx={{ mt: 3 }}
						>
							{t('verify-email')}
						</Button>
					</Box>
				</Box>
			</QueryDisplay>
		</Box>
	);
};

export default VerifyEmailPage;

const LoadingFormView = () => {
	return (
		<Box sx={{ width: '100%', mt: 2 }}>
			<Skeleton variant="text" width="60%" height={40} />
			<Skeleton variant="text" width="80%" height={24} sx={{ mt: 1 }} />
			<Skeleton
				variant="rectangular"
				width="100%"
				height={120}
				sx={{ mt: 2, borderRadius: 1 }}
			/>
			<Skeleton variant="text" width="40%" height={24} sx={{ mt: 2 }} />
		</Box>
	);
};

const InvalidTokenView = ({
	error,
	forceIsInvalid = false,
}: { error?: unknown; forceIsInvalid?: boolean }) => {
	const { t } = useTranslate();

	const renderInvalidTokenView = () => {
		return (
			<Box>
				<Typography variant="h3" color="text.primary" mb={2}>
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
			email: 'dazdazdazdazda@gmlaz.daz',
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
					{t('verify-email-request-sent-description')}
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
