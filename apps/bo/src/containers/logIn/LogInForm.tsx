import { Box, Button, CircularProgress, TextField } from '@mui/material';
import { SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { LogInInput, logInSchema } from '@aktiveo/shared/validations/auth.validations';
import { useLogInMutation } from '@aktiveo/ui-react/query/features/auth/auth.hooks';

const LogInForm = () => {
	const form = useForm<LogInInput>({ resolver: zodResolver(logInSchema) });

	const {
		handleSubmit,
		register,
		formState: { errors /* , isDirty, isValid */ },
	} = form;

	const { mutate: logIn, isPending } = useLogInMutation();

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
