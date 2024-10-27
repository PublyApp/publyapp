import { useState, type ReactNode } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import LoadingButton from '@mui/lab/LoadingButton';
import { Alert, IconButton, InputAdornment, Link, Stack, Typography, type AlertProps } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useForm /* , type SubmitHandler */ } from 'react-hook-form';
import { useLocation, useNavigate, useRevalidator } from 'react-router-dom';
import { StringParam, useQueryParam } from 'use-query-params';

import { getLoginSchema /* , type LoginInput */ } from '@devist/shared/validations/auth.validations';

import RouterLink from '@/office/components/RouterLink';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import FormProvider from '@/ui-react/components/form/FormProvider';
import RHFTextField from '@/ui-react/components/form/RHFTextField';
import Iconify from '@/ui-react/components/Iconify';
import useBoolean from '@/ui-react/hooks/useBoolean';
import useTranslate from '@/ui-react/hooks/useTranslate';
// import FormProvider, { RHFTextField } from 'src/components/hook-form';
import { getUserAuthDataQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import { useLoginMutation } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
import zod from '@/ui-react/lib/zod';
import { pxToRem } from '@/ui-react/utils/css.utils';

const queryParamPrefix = 'login' as const;
export const queryParamKeys = {
	redirectCause: `${queryParamPrefix}:redirect_cause`,
} as const;

const redirectCause = {
	INVALID_SESSION: 'invalid_session',
} as const;

const Login = () => {
	const [redirectCauseParam] = useQueryParam(queryParamKeys.redirectCause, StringParam);
	const password = useBoolean();
	const { t } = useTranslate();

	const [alertProps, setAlertProps] = useState<{
		message: ReactNode;
		severity: AlertProps['severity'];
	}>();

	const defaultValues = {
		email: '',
		password: '',
	};

	const loginForm = useForm({
		resolver: zodResolver(getLoginSchema(zod)),
		defaultValues,
	});

	const {
		handleSubmit,
		// formState: { isSubmitting },
	} = loginForm;

	const queryClient = useQueryClient();
	const { revalidate } = useRevalidator();
	const navigate = useNavigate();
	const location = useLocation();

	const {
		result: { mutate: login, isPending },
	} = useLoginMutation({
		options: {
			onSuccess: async () => {
				queryClient.removeQueries({ queryKey: [getUserAuthDataQuery().queryKey[0]] });

				revalidate();

				navigate(location.state?.from || BO_PATH_NAMES.portal, { replace: true }); // todo: tenant aware redirection
			},
			onError: (error /* , variables, context */) => {
				if (error instanceof AxiosError) {
					if (error.response?.data.message === t('User email is not verified.')) {
						// show an alert on top of the login form
						setAlertProps({
							severity: 'error',
							message: (
								<div>
									{error.response?.data.message}
									<br />
									<Link
										component={RouterLink}
										href={BO_PATH_NAMES.auth.verifyEmail}
										variant="subtitle2"
										sx={{
											color: (theme) => {
												return theme.palette.error.dark;
											},
										}}
									>
										{t('verify-my-email')}
									</Link>
								</div>
							),
						});
					} else {
						// show an alert on top of the login form
						setAlertProps({
							severity: 'error',
							message: <div>{t(error.response?.data.message)}</div>,
						});
					}
				}
			},
		},
	});

	// const onSubmit = handleSubmit(async (data) => {});
	// const onSubmitHandler: SubmitHandler<LoginInput> = async (values) => {
	// 	login(values);
	// };

	const onSubmit = handleSubmit(
		async (values) => {
			login(values);
		},
		(errors) => {
			console.log('--- loginForm errors ----', errors);
		},
	);

	const renderHead = (
		<Stack spacing={2} sx={{ mb: 5 }}>
			<Typography variant="h4">{t('sign-in')}</Typography>

			<Stack direction="row" spacing={0.5}>
				<Typography variant="body2">{t('new-item', { item: t('user') })}?</Typography>

				<Link component={RouterLink} href={BO_PATH_NAMES.auth.signup} variant="subtitle2">
					{t('create-an-account')}
				</Link>
			</Stack>
		</Stack>
	);

	const renderAlert = (_alertProps: typeof alertProps) => {
		return (
			<Alert severity={_alertProps?.severity} onClose={undefined} sx={{ mb: pxToRem(20) }}>
				{/* This post does not have a translation in the current language */}
				{/* {t('item-not-translated', { item: t('post') })} */}
				{_alertProps?.message}
			</Alert>
		);
	};

	const renderForm = (
		<Stack spacing={2.5}>
			<RHFTextField name="email" label={t('email-address')} />

			<RHFTextField
				name="password"
				label={t('password')}
				type={password.value ? 'text' : 'password'}
				InputProps={{
					endAdornment: (
						<InputAdornment position="end">
							<IconButton onClick={password.toggle} edge="end">
								<Iconify icon={password.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'} />
							</IconButton>
						</InputAdornment>
					),
				}}
			/>

			<Link
				component={RouterLink}
				href={BO_PATH_NAMES.auth.forgotPassword}
				variant="body2"
				color="inherit"
				underline="always"
				sx={{ alignSelf: 'flex-end' }}
			>
				{t('forgot-password')}
			</Link>

			<LoadingButton fullWidth color="inherit" size="large" type="submit" variant="contained" loading={isPending}>
				{t('login')}
			</LoadingButton>
		</Stack>
	);

	return (
		<FormProvider form={loginForm} onSubmit={onSubmit}>
			{renderHead}

			{/* render alert in function of network calls from form submission */}
			{alertProps ? renderAlert(alertProps) : null}

			{/* render alert in function of redirect cause */}
			{!alertProps && redirectCauseParam === redirectCause.INVALID_SESSION
				? renderAlert({ severity: 'error', message: <div>{t('invalid-session')}</div> })
				: null}

			{renderForm}
		</FormProvider>
	);
};

Login.queryParamKeys = queryParamKeys;
Login.redirectCause = redirectCause;

export default Login;
