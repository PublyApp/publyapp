// import zod from "@/ui-react/lib/zod";
import { zodResolver } from '@hookform/resolvers/zod';
import LoadingButton from '@mui/lab/LoadingButton';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useLocation, useNavigate, useRevalidator } from 'react-router-dom';

import { logInSchema, type LogInInput } from '@devist/shared/validations/auth.validations';

import RouterLink from '@/office/components/RouterLink';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import FormProvider from '@/ui-react/components/form/FormProvider';
import RHFTextField from '@/ui-react/components/form/RHFTextField';
import Iconify from '@/ui-react/components/Iconify';
import useBoolean from '@/ui-react/hooks/useBoolean';
// import FormProvider, { RHFTextField } from 'src/components/hook-form';
import { getUserAuthDataQuery } from '@/ui-react/lib/react-query/features/auth/auth.actions';
import { useLogInMutation } from '@/ui-react/lib/react-query/features/auth/auth.hooks';

const Login = () => {
	const password = useBoolean();

	// const LoginSchema = Yup.object().shape({
	// 	// email: Yup.string().required('Email is required').email('Email must be a valid email address'),
	// 	// password: Yup.string().required('Password is required'),
	// });

	const defaultValues = {
		email: '',
		password: '',
	};

	const loginForm = useForm({
		resolver: zodResolver(logInSchema),
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
		result: { mutate: logIn, isPending },
	} = useLogInMutation({
		options: {
			onSuccess: async () => {
				// resetBoundary();
				// navigate(location.state.from || BO_PATH_NAMES.dashboard.root, { replace: true });

				// const authActions = new AuthActions(parseApi);

				queryClient.invalidateQueries({ queryKey: getUserAuthDataQuery.queryKey });

				// refetchClientAuth();

				// const authData = await getClientAuthAction();
				// queryClient.setQueryData([getClientAuthQueryKeyBase] as const, authData);

				revalidate();

				navigate(location.state?.from || BO_PATH_NAMES.dashboard.root, { replace: true });
			},
		},
	});

	// const onSubmit = handleSubmit(async (data) => {});
	const onSubmitHandler: SubmitHandler<LogInInput> = async (values) => {
		logIn(values);
	};

	const onSubmit = handleSubmit(onSubmitHandler);

	const renderHead = (
		<Stack spacing={2} sx={{ mb: 5 }}>
			<Typography variant="h4">Sign in to Minimal</Typography>

			<Stack direction="row" spacing={0.5}>
				<Typography variant="body2">New user?</Typography>

				<Link component={RouterLink} href={BO_PATH_NAMES.auth.register} variant="subtitle2">
					Create an account
				</Link>
			</Stack>
		</Stack>
	);

	const renderForm = (
		<Stack spacing={2.5}>
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

			<Link
				component={RouterLink}
				href={BO_PATH_NAMES.auth.forgotPassword}
				variant="body2"
				color="inherit"
				underline="always"
				sx={{ alignSelf: 'flex-end' }}
			>
				Forgot password?
			</Link>

			<LoadingButton fullWidth color="inherit" size="large" type="submit" variant="contained" loading={isPending}>
				Login
			</LoadingButton>
		</Stack>
	);

	return (
		<FormProvider form={loginForm} onSubmit={onSubmit}>
			{renderHead}

			{renderForm}
		</FormProvider>
	);
};

export default Login;
