import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import { useBoolean } from 'minimal-shared/hooks';
import { useForm } from 'react-hook-form';
import { useFetcher } from 'react-router';
import type { z } from 'zod';

import { FormHead } from '@/front/components/auth/form-head';
import { Field, Form } from '@/front/components/hook-form';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { defaultZodClient } from '@/front/lib/zod';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { getErrorMessage } from '@/shared/utils/error-message';
import { getLoginSchema } from '@/shared/validations/auth.validations';

import type { LoginActionResult } from './login-page';

// ----------------------------------------------------------------------

export type SignInSchemaType = z.infer<typeof SignInSchema>;

export const SignInSchema = getLoginSchema(defaultZodClient);

// ----------------------------------------------------------------------

const LoginForm = () => {
	// const router = useRouter();
	// const isLoading = fetcher.state === 'loading';
	const showPassword = useBoolean();

	const fetcher = useFetcher<LoginActionResult>();

	const errorFetcher = fetcher.data?.error;
	const errorMessage = errorFetcher ? getErrorMessage(errorFetcher) : null;

	// const [errorMessage, setErrorMessage] = useState<string | null>(errorFetcher ? getErrorMessage(errorFetcher) : null);

	const methods = useForm({
		resolver: zodResolver(getLoginSchema(defaultZodClient)),
		defaultValues: {
			email: '',
			password: '',
		},
	});

	const {
		formState: { isSubmitting },
	} = methods;

	const handleLogin = methods.handleSubmit(async (data) => {
		await fetcher.submit(data, {
			method: 'post',
		});
	});

	const renderForm = () => (
		<Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
			<Field.Text
				name="email"
				label="Email address"
				slotProps={{ inputLabel: { shrink: true } }}
			/>

			<Box sx={{ gap: 1.5, display: 'flex', flexDirection: 'column' }}>
				{/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
				<Link
					component={RouterLink}
					href="#"
					variant="body2"
					color="inherit"
					sx={{ alignSelf: 'flex-end' }}
				>
					Forgot password?
				</Link>

				<Field.Text
					name="password"
					label="Password"
					placeholder="6+ characters"
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
			</Box>

			<Button
				fullWidth
				color="inherit"
				size="large"
				type="submit"
				variant="contained"
				loading={isSubmitting}
				loadingIndicator="Sign in..."
			>
				Sign in
			</Button>
		</Box>
	);

	return (
		<>
			<FormHead
				title="Sign in to your account"
				description={
					<>
						{"Don't have an account? "}
						<Link
							component={RouterLink}
							href={FRONT_PATH_NAMES.auth.signup}
							variant="subtitle2"
						>
							Get started
						</Link>
					</>
				}
				sx={{ textAlign: { xs: 'center', md: 'left' } }}
			/>

			{/* <Alert severity="info" sx={{ mb: 3 }}>
        Use <strong>{defaultValues.email}</strong>
        {' with password '}
        <strong>{defaultValues.password}</strong>
      </Alert> */}

			{!!errorMessage && (
				<Alert severity="error" sx={{ mb: 3 }}>
					{errorMessage}
				</Alert>
			)}

			<Form methods={methods} onSubmit={handleLogin}>
				{renderForm()}
			</Form>
		</>
	);
};

export default LoginForm;
