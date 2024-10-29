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
import { defaultZodClient } from '@/ui-react/lib/zod';

// import { getUserAuthDataQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
// import { useLoginMutation } from '@/ui-react/lib/react-query/features/auth/auth.hooks';
// import { pxToRem } from '@/ui-react/utils/css.utils';

const VerifyEmailPage = () => {
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

	const verifyEmailSchema = getVerifyEmailSchema(defaultZodClient);

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
	} = useVerifyEmailMutation();

	const onSubmitHandler: SubmitHandler<VerifyEmailInput> = async (values) => {
		verifyEmail(values);
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

export default VerifyEmailPage;
