import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useBoolean } from 'minimal-shared/hooks';
import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useFetcher, useSearchParams } from 'react-router';
import { Field } from '@/front/components/hook-form/fields';
import { Form } from '@/front/components/hook-form/form-provider';
import { Iconify } from '@/front/components/iconify/iconify';
import { toast } from '@/front/components/snackbar';
import { useLanguageTriggerValidation } from '@/front/hooks/use-language-trigger-validation';
import { useTranslate } from '@/front/hooks/use-translate';
import { safeRun } from '@/front/lib/react-router/safeRun';
import {
	getServerAction,
	getServerLoader,
} from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { queryParamKey, queryParamValue, X_CODE } from '@/shared/lib/constants';
import { getErrorMessage } from '@/shared/utils/error-message';
import { getResetPasswordSchema } from '@/shared/validations/auth.validations';
import InvalidLinkView from '../components/invalid-link-view';
import type { Route } from './+types/reset-password-page';

export const action = getServerAction({
	action: async ({ request }) => {
		const formData = await request.formData();
		const password = formData.get('password');
		const confirmPassword = formData.get('confirmPassword');

		if (password !== confirmPassword) {
			return {
				status: 'error',
				error: 'Passwords do not match',
			} as const;
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

		if (!token || !encodedEmail) {
			return {
				code: 'INVALID_LINK',
			} as const;
		}

		// let isValidEncodedString = false;
		// let decodedEmail = '';

		// try {
		// 	decodedEmail = decodeString(encodedEmail);
		// 	isValidEncodedString = true;
		// } catch (_error) {
		// 	isValidEncodedString = false;
		// }

		// if (!isValidEncodedString) {
		// 	return {
		// 		code: 'INVALID_LINK',
		// 	} as const;
		// }

		const checkResetPasswordToken = safeRun(
			apiClient.auth.checkResetPasswordToken,
		);

		// verify if token belongs to the email
		const result = await checkResetPasswordToken({
			id: encodedEmail,
			token,
		});

		if (result.status === 'error') {
			if (result.error instanceof ParseRestError) {
				if (result.error.code === X_CODE.INVALID_RESET_PASSWORD_TOKEN_OR_ID) {
					return {
						code: 'INVALID_LINK',
					} as const;
				}
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

const ResetPasswordPage = ({ loaderData }: Route.ComponentProps) => {
	const { t } = useTranslate();
	const [searchParams] = useSearchParams();
	const redirect_cause = searchParams.get(
		queryParamKey.login_page.redirect_cause,
	);
	const hasShownToast = useRef(false);

	useEffect(() => {
		if (!hasShownToast.current) {
			if (
				redirect_cause ===
					queryParamValue.reset_password_page.redirect_cause
						.email_verification &&
				loaderData.code === 'OK'
			) {
				toast.success(t('email-verification-success'));
			}

			hasShownToast.current = true;
		}
	}, [redirect_cause, t, loaderData.code]);

	if (loaderData.code === 'INVALID_LINK') {
		return (
			<Box sx={boxStyles}>
				<InvalidLinkView forceIsInvalid />
			</Box>
		);
	}

	return (
		<Box sx={boxStyles}>
			<ResetPasswordForm />
		</Box>
	);
};

export default ResetPasswordPage;

const ResetPasswordForm = () => {
	const { t, i18n } = useTranslate();
	const showPassword = useBoolean();
	const showConfirmPassword = useBoolean();

	const schema = getResetPasswordSchema(defaultZodClient);

	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			password: '',
			confirmPassword: '',
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
		await fetcher.submit(data, {
			method: 'post',
		});
	});

	return (
		<>
			{!!errorMessage && (
				<Alert severity="error" sx={{ mb: 3 }}>
					{errorMessage}
				</Alert>
			)}
			<Form methods={form} onSubmit={handleSubmit}>
				<Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
					<Typography variant="h5" color="text.primary" sx={{ mb: 2 }}>
						{t('reset-password')}
					</Typography>
					{/* <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
					{formText[intent].description}
				</Typography> */}

					<Field.Text
						name="password"
						label={t('password')}
						placeholder={t('n+ characters', { characters: '8' })}
						type={showPassword.value ? 'text' : 'password'}
						slotProps={{
							inputLabel: { shrink: true },
							input: {
								endAdornment: (
									<InputAdornment position="end">
										<IconButton onClick={showPassword.onToggle} edge="end">
											<Iconify
												icon={
													showPassword.value
														? 'solar:eye-bold'
														: 'solar:eye-closed-bold'
												}
											/>
										</IconButton>
									</InputAdornment>
								),
							},
						}}
					/>

					<Field.Text
						name="confirmPassword"
						label={t('confirm-password')}
						placeholder={t('n+ characters', { characters: '8' })}
						type={showConfirmPassword.value ? 'text' : 'password'}
						slotProps={{
							inputLabel: { shrink: true },
							input: {
								endAdornment: (
									<InputAdornment position="end">
										<IconButton
											onClick={showConfirmPassword.onToggle}
											edge="end"
										>
											<Iconify
												icon={
													showConfirmPassword.value
														? 'solar:eye-bold'
														: 'solar:eye-closed-bold'
												}
											/>
										</IconButton>
									</InputAdornment>
								),
							},
						}}
					/>

					<Button
						fullWidth
						size="large"
						type="submit"
						variant="contained"
						sx={{ mt: 3 }}
						loading={isSubmitting}
						// loadingIndicator={`${t('verify-email')}...`}
					>
						{t('reset-password')}
					</Button>
				</Box>
			</Form>
		</>
	);
};
