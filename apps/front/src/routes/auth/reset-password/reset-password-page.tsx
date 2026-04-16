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
import { Trans } from 'react-i18next';
import {
	redirect,
	useFetcher,
	useLoaderData,
	useSearchParams,
} from 'react-router';
import { serializeError } from 'serialize-error';

import {
	FRONT_PATH_NAMES,
	queryParamKey,
	queryParamValue,
} from '@org/shared-ts/lib/constants';
import { getCorrectLocale } from '@org/shared-ts/lib/i18n/i18n.utils';
import { getSerializedErrorMessage } from '@org/shared-ts/utils/error.utils';
import { getResetPasswordSchema } from '@org/shared-ts/validations/auth.validations';

import { Field } from '#app/components/hook-form/fields.tsx';
import { Form } from '#app/components/hook-form/form-provider.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useSyncFormToLang } from '#app/hooks/use-sync-form-to-lang.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getClientManager } from '#app/lib/js-client/client-manager.ts';
import { safeRun } from '#app/lib/react-router/safeRun.ts';
import {
	getServerAction,
	getServerLoader,
} from '#app/lib/react-router/server-data.server.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';

import InvalidLinkView from '../components/invalid-link-view';
import type { Route } from './+types/reset-password-page';

export const action = getServerAction({
	action: async ({ request, z, context }) => {
		const apiClient = getClientManager().createClient({ skipAuth: true });
		const searchParams = new URL(request.url).searchParams;
		const token = searchParams.get(queryParamKey.token);
		const encodedEmail = searchParams.get(
			queryParamKey.reset_password_page.encoded_email,
		);

		const formData = await request.formData();
		const newPassword = formData.get('newPassword');
		const confirmPassword = formData.get('confirmPassword');

		const resetPassword = safeRun(
			async (params: {
				id: string;
				token: string;
				newPassword: string;
				confirmPassword: string;
			}) => {
				return await apiClient.auth.resetPassword.post({
					id: {
						getValue: () => {
							return params.id;
						},
					},
					token: {
						getValue: () => {
							return params.token;
						},
					},
					newPassword: {
						getValue: () => {
							return params.newPassword;
						},
					},
					confirmPassword: {
						getValue: () => {
							return params.confirmPassword;
						},
					},
				});
			},
		);

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
			context.logger.error('Failed to reset password', {
				error: serializeError(result.error),
			});

			return {
				status: 'error',
				error: serializeError(result.error),
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
	loader: async ({ request, context }) => {
		const apiClient = getClientManager().createClient({ skipAuth: true });
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
			async (params: { id: string; token: string }) => {
				return await apiClient.auth.checkResetPasswordToken.get({
					queryParameters: {
						id: params.id,
						token: params.token,
					},
				});
			},
		);

		// verify if token belongs to the email
		const result = await checkResetPasswordToken({
			id: encodedEmail,
			token,
		});

		if (result.status === 'error') {
			context.logger.error('Failed to check reset password token', {
				error: serializeError(result.error),
			});

			if (result.error.message === 'Invalid or expired password reset token') {
				return {
					code: 'INVALID_LINK',
				} as const;
			}

			throw result.error;
		}

		return {
			code: 'OK',
			email: result.data?.email ?? '',
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

	const schema = getResetPasswordSchema(interZodClient);

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

	const errorMessage = getSerializedErrorMessage(fetcher.data?.error, t);

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
					<Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
						<Trans
							i18nKey="reset-password-description"
							values={{ email: loaderData.email }}
							components={{ strong: <strong /> }}
						/>
					</Typography>

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
