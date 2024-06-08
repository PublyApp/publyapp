import { zodResolver } from '@hookform/resolvers/zod';
import LoadingButton from '@mui/lab/LoadingButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useForm, type SubmitHandler } from 'react-hook-form';

import { getVerifyEmailSchema, type VerifyEmailInput } from '@devist/shared/validations/auth.validations';

import RouterLink from '@/office/components/RouterLink';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import FormProvider from '@/ui-react/components/form/FormProvider';
import RHFTextField from '@/ui-react/components/form/RHFTextField';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { useVerifyEmailMutation } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
import zod from '@/ui-react/lib/zod';

// import { getUserAuthDataQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
// import { useLoginMutation } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
// import { pxToRem } from '@/ui-react/utils/css.utils';

const VerifyEmail = () => {
	// const password = useBoolean();
	const { t } = useTranslate();
	// const theme = useTheme();
	// const [alertProps, setAlertProps] = useState<{
	// 	message: ReactNode;
	// 	severity: AlertProps['severity'];
	// }>();

	const defaultValues = {
		email: '',
	};

	const verifyEmailSchema = getVerifyEmailSchema(zod);

	const verifyEmailForm = useForm({
		resolver: zodResolver(verifyEmailSchema),
		defaultValues,
	});

	const {
		handleSubmit,
		// formState: { isSubmitting },
	} = verifyEmailForm;

	// const queryClient = useQueryClient();
	// const { revalidate } = useRevalidator();
	// const navigate = useNavigate();
	// const location = useLocation();

	const {
		result: { mutate: verifyEmail, isPending },
	} = useVerifyEmailMutation({
		options: {
			onSuccess: async () => {
				// resetBoundary();
				// navigate(location.state.from || BO_PATH_NAMES.dashboard.root, { replace: true });
				// const authActions = new AuthActions(parseApi);
				// queryClient.invalidateQueries({ queryKey: getUserAuthDataQuery.queryKey });
				// refetchClientAuth();
				// const authData = await getClientAuthAction();
				// queryClient.setQueryData([getClientAuthQueryKeyBase] as const, authData);
				// revalidate();
				// navigate(location.state?.from || BO_PATH_NAMES.dashboard.root, { replace: true });
			},
			// onError: (error /* , variables, context */) => {
			// 	if (error instanceof AxiosError) {
			// 		if (error.response?.data.message === t('User email is not verified.')) {
			// 			// show an alert on top of the login form
			// 			setAlertProps({
			// 				message: (
			// 					<div>
			// 						{error.response?.data.message}
			// 						<br />
			// 						<RouterLink href={BO_PATH_NAMES.auth.verifyEmail}>{t('verify-my-email')}</RouterLink>
			// 					</div>
			// 				),
			// 				severity: 'error',
			// 			});
			// 		}
			// 	}
			// },
		},
	});

	// const onSubmit = handleSubmit(async (data) => {});
	const onSubmitHandler: SubmitHandler<VerifyEmailInput> = async (values) => {
		verifyEmail(values);
		// console.log(values);
	};

	const onSubmit = handleSubmit(onSubmitHandler);

	const renderHead = (
		<Stack spacing={2} sx={{ mb: 5 }}>
			<Typography variant="h4">{t('verify-my-email')}</Typography>

			<Stack direction="row" spacing={0.5}>
				<Typography variant="body2">{t('new-item', { item: t('user') })}?</Typography>

				<Link component={RouterLink} href={BO_PATH_NAMES.auth.signup} variant="subtitle2">
					{t('create-an-account')}
				</Link>
			</Stack>
		</Stack>
	);

	// const renderAlert = (
	// 	<Alert severity={alertProps?.severity} onClose={undefined} sx={{ mb: pxToRem(20) }}>
	// 		{/* This post does not have a translation in the current language */}
	// 		{/* {t('item-not-translated', { item: t('post') })} */}
	// 		{alertProps?.message}
	// 	</Alert>
	// );

	const renderForm = (
		<Stack spacing={2.5}>
			<RHFTextField name="email" label={t('email-address')} />

			{/* <RHFTextField
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
			/> */}

			{/* <Link
				component={RouterLink}
				href={BO_PATH_NAMES.auth.forgotPassword}
				variant="body2"
				color="inherit"
				underline="always"
				sx={{ alignSelf: 'flex-end' }}
			>
				{t('forgot-password')}
			</Link> */}

			<LoadingButton fullWidth color="inherit" size="large" type="submit" variant="contained" loading={isPending}>
				{/* Login */}
				{t('verify-my-email')}
			</LoadingButton>
		</Stack>
	);

	return (
		<FormProvider form={verifyEmailForm} onSubmit={onSubmit}>
			{renderHead}

			{/* {alertProps ? renderAlert : null} */}

			{renderForm}
		</FormProvider>
	);
};

export default VerifyEmail;
