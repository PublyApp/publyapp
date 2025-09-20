import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useBoolean } from 'minimal-shared/hooks';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
	redirect,
	useFetcher,
	useLoaderData,
	useSearchParams,
} from 'react-router';
// import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { Field } from '@/front/components/hook-form/fields';
import { Form } from '@/front/components/hook-form/form-provider';
import { Iconify } from '@/front/components/iconify/iconify';
import { toast } from '@/front/components/snackbar';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { safeRun } from '@/front/lib/react-router/safeRun';
import {
	getServerAction,
	getServerLoader,
} from '@/front/lib/react-router/server-data.server';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import {
	FRONT_PATH_NAMES,
	queryParamKey,
	queryParamValue,
	X_CODE,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import { getErrorMessage } from '@/shared/utils/error.utils';
import { getResetPasswordSchema } from '@/shared/validations/auth.validations';
import InvalidLinkView from '../components/invalid-link-view';
import type { Route } from './+types/reset-password-page';

export const action = getServerAction({
	action: async ({ request, apiClient, z }) => {
		const searchParams = new URL(request.url).searchParams;
		const token = searchParams.get(queryParamKey.token);
		const encodedEmail = searchParams.get(
			queryParamKey.reset_password_page.encoded_email,
		);

		const formData = await request.formData();
		const newPassword = formData.get('newPassword');
		const confirmPassword = formData.get('confirmPassword');

		const resetPassword = safeRun(apiClient.auth.resetPassword);

		const schema = getResetPasswordSchema(z).and(
			z.object({
				token: z.string().min(1),
				id: z.string().min(1),
			}),
		);

		const validationResult = schema.safeParse({
			newPassword,
			confirmPassword,
			token,
			id: encodedEmail,
		});

		if (!validationResult.success) {
			return {
				status: 'error',
				error: validationResult.error.errors[0].message,
			} as const;
		}

		const result = await resetPassword({
			id: validationResult.data.id,
			token: validationResult.data.token,
			newPassword: validationResult.data.newPassword,
			confirmPassword: validationResult.data.confirmPassword,
		});

		if (result.status === 'error') {
			return {
				status: 'error',
				error: result.error.message,
			} as const;
		}

		const redirectParams = new URLSearchParams();
		redirectParams.set(
			queryParamKey.login_page.redirect_cause,
			queryParamValue.login_page.redirect_cause.password_reset_success,
		);
		redirectParams.set(
			queryParamKey.language,
			getCorrectLocale(searchParams.get(queryParamKey.language)),
		);
		return redirect(
			`${FRONT_PATH_NAMES.auth.login}?${redirectParams.toString()}`,
		);
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

		const checkResetPasswordToken = safeRun(
			apiClient.auth.checkResetPasswordToken,
		);

		// verify if token belongs to the email
		const result = await checkResetPasswordToken({
			id: encodedEmail,
			token,
		});

		if (result.status === 'error') {
			// if (result.error instanceof ParseRestError) {
			// 	if (result.error.code === X_CODE.INVALID_RESET_PASSWORD_TOKEN_OR_ID) {
			// 		return {
			// 			code: 'INVALID_LINK',
			// 		} as const;
			// 	}
			// }

			throw result.error;
		}

		return {
			code: 'OK',
			email: result.data.email,
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
	const loaderData = useLoaderData<typeof loader>();

	const schema = getResetPasswordSchema(defaultZodClient);

	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			newPassword: '',
			confirmPassword: '',
		},
	});

	const {
		formState: { isSubmitting },
	} = form;

	useSyncFormToLang(i18n.language, form);

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
					<Typography
						variant="body1"
						color="text.secondary"
						sx={{ mb: 3 }}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: It's only dangerousIf we let users to set it
						dangerouslySetInnerHTML={{
							__html: t('reset-password-description', {
								email: loaderData.email,
							}),
						}}
					/>

					<Field.Text
						name="newPassword"
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
					>
						{t('reset-password')}
					</Button>
				</Box>
			</Form>
		</>
	);
};
