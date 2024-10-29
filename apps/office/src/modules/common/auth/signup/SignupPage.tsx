// import * as Yup from 'yup';
import { zodResolver } from '@hookform/resolvers/zod';
import LoadingButton from '@mui/lab/LoadingButton';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { defer, Navigate } from 'react-router-dom';

import RouterLink from '@/office/components/RouterLink';
import { getRouteLoader } from '@/office/routes/utils';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import { getRegisterSchema, type SignupInput } from '@/shared/validations/auth.validations';
import FormProvider from '@/ui-react/components/form/FormProvider';
import RHFTextField from '@/ui-react/components/form/RHFTextField';
import Iconify from '@/ui-react/components/Iconify';
import useBoolean from '@/ui-react/hooks/useBoolean';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { getIsDisabledSignupQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import {
	useGetIsDisabledSignupSuspenseQuery,
	useSignupMutation,
} from '@/ui-react/lib/react-query/features/auth/auth.hooks';
import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';
import { defaultZodClient } from '@/ui-react/lib/zod';

// import { paths } from 'src/routes/paths';
// import { RouterLink } from 'src/routes/components';
// import Iconify from 'src/components/iconify';
// import FormProvider, { RHFTextField } from 'src/components/hook-form';
// import { useBoolean } from 'src/hooks/use-boolean';

// ----------------------------------------------------------------------

const SignupPage = () => {
	const { t } = useTranslate();
	const password = useBoolean();

	const {
		result: { data: signupConfigData },
	} = useGetIsDisabledSignupSuspenseQuery();

	const {
		result: { mutate: signup, isPending: isPendingSignup },
	} = useSignupMutation();

	const registerForm = useForm({
		resolver: zodResolver(getRegisterSchema(defaultZodClient)),
		defaultValues: {
			firstName: '',
			lastName: '',
			email: '',
			password: '',
		},
	});

	const {
		handleSubmit,
		// formState: { isSubmitting },
	} = registerForm;

	const onSubmitHandler: SubmitHandler<SignupInput> = async (data) => {
		try {
			signup(data);
		} catch (error) {
			console.error(error);
		}
	};

	const onSubmit = handleSubmit(onSubmitHandler);

	const renderHead = (
		<Stack spacing={2} sx={{ mb: 5, position: 'relative' }}>
			<Typography variant="h4">{t('sign-up')}</Typography>

			<Stack direction="row" spacing={0.5}>
				<Typography variant="body2"> Already have an account? </Typography>

				<Link href={BO_PATH_NAMES.auth.login} component={RouterLink} variant="subtitle2">
					Sign in
				</Link>
			</Stack>
		</Stack>
	);

	const renderTerms = (
		<Typography
			component="div"
			sx={{
				color: 'text.secondary',
				mt: 2.5,
				typography: 'caption',
				textAlign: 'center',
			}}
		>
			{'By signing up, I agree to '}
			{/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
			<Link underline="always" color="text.primary">
				Terms of Service
			</Link>
			{' and '}
			{/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
			<Link underline="always" color="text.primary">
				Privacy Policy
			</Link>
			.
		</Typography>
	);

	const renderForm = (
		<Stack spacing={2.5}>
			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
				<RHFTextField name="firstName" label="First name" />
				<RHFTextField name="lastName" label="Last name" />
			</Stack>

			<RHFTextField name="email" label="Email address" />

			<RHFTextField
				name="password"
				label="Password"
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

			<LoadingButton fullWidth color="inherit" size="large" type="submit" variant="contained" loading={isPendingSignup}>
				Create account
			</LoadingButton>
		</Stack>
	);

	if (signupConfigData.disabledSignup) {
		return <Navigate to={BO_PATH_NAMES.auth.login} />;
	}

	return (
		<FormProvider form={registerForm} onSubmit={onSubmit}>
			{renderHead}

			{renderForm}

			{renderTerms}
		</FormProvider>
	);
};

export default SignupPage;

export const SignupRoute = {
	loader: getRouteLoader(async () => {
		const cachedSignupConfigData = defaultQueryClient.getQueryData(getIsDisabledSignupQuery.queryKey);

		const signupConfigData = cachedSignupConfigData
			? Promise.resolve(cachedSignupConfigData)
			: defaultQueryClient.fetchQuery(getIsDisabledSignupQuery);

		return defer({
			signupConfigData,
		});
	}),
};
