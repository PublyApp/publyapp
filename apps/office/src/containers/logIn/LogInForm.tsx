import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, CircularProgress, TextField } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useErrorBoundary } from 'react-error-boundary';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';

import { BO_PATH_NAMES } from '@devist/shared/lib/constants';
import { logInSchema, type LogInInput } from '@devist/shared/validations/auth.validations';
import {
	getClientAuthQueryKeyBase,
	// useGetClientAuthSuspenseQuery,
	useLogInMutation,
} from '@devist/ui-react/lib/react-query/features/auth/auth.hooks';

// import { getClientAuthAction } from '@/ui-react/lib/react-query/features/auth/auth.actions';

const LogInForm = () => {
	const form = useForm<LogInInput>({ resolver: zodResolver(logInSchema) });
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const location = useLocation();
	const { resetBoundary } = useErrorBoundary();

	const {
		handleSubmit,
		register,
		formState: { errors /* , isDirty, isValid */ },
	} = form;

	// const {
	// 	// key: useGetClientAuthQueryKey,
	// 	result: { refetch: refetchClientAuth },
	// } = useGetClientAuthSuspenseQuery(/* { enabled: false } */);

	const {
		result: { mutate: logIn, isPending },
	} = useLogInMutation({
		onSuccess: async () => {
			resetBoundary();
			await queryClient.invalidateQueries({ queryKey: [getClientAuthQueryKeyBase] });
			// const authData = await getClientAuthAction();
			// queryClient.setQueryData([getClientAuthQueryKeyBase] as const, authData);
			// refetchClientAuth();
			navigate(location.state.from || BO_PATH_NAMES.dashboard.root, { replace: true });
		},
	});

	const onSubmitHandler: SubmitHandler<LogInInput> = async (values) => {
		logIn(values);
	};

	return (
		<Box
			sx={{
				background: '#fff',
				border: '1px solid #e5e5e5',
				borderRadius: '10px',
				padding: '50px',
				marginBottom: '16px',
			}}
		>
			<Box component="form">
				<TextField type="email" error={!!errors.email} helperText={errors.email?.message} {...register('email')} />
				<TextField
					type="password"
					error={!!errors.password}
					helperText={errors.password?.message}
					{...register('password')}
				/>
				<Button variant="contained" onClick={handleSubmit(onSubmitHandler)}>
					{isPending ? <CircularProgress /> : 'Log In'}
				</Button>
			</Box>
		</Box>
	);
};

export default LogInForm;
