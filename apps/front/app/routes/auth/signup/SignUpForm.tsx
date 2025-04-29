import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { useBoolean } from 'minimal-shared/hooks';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
// import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';

import { RouterLink } from '@/front/components/router-link';
import { Iconify } from '@/front/components/iconify/iconify';
import { Field, Form } from '@/front/components/hook-form';

// import { getErrorMessage } from '@/shared/utils/error-message';
import { getSignUpSchema } from '@/shared/validations/auth.validations';
import { FormHead } from '@/front/components/auth/form-head';
import { SignUpTerms } from '@/front/components/auth/sign-up-terms';
import { defaultZodClient } from '@/front/lib/zod';
// import { useFetcher } from 'react-router';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

// ----------------------------------------------------------------------

export type SignUpSchemaType = z.infer<typeof SignUpSchema>;
export const SignUpSchema = getSignUpSchema(defaultZodClient);

// ----------------------------------------------------------------------

const SignupForm = () => {
	const showPassword = useBoolean();

	// const [errorMessage, setErrorMessage] = useState<string | null>(null);

	/* const errorFetcher = fetcher.data?.error;
    const errorMessage = errorFetcher ? getErrorMessage(errorFetcher) : null;

    const fetcher = useFetcher<SignUpActionResult>(); */

	const methods = useForm({
		resolver: zodResolver(getSignUpSchema(defaultZodClient)),
		defaultValues: {
			firstName: '',
			lastName: '',
			email: '',
			password: '',
		},
	});

	const {
		formState: { isSubmitting },
	} = methods;

	/* const handleSignUp = methods.handleSubmit(async (data) => {
        await fetcher.submit(data, {
            method: 'post',
        });
    }); */

	const renderForm = () => (
		<Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
			<Box
				sx={{
					display: 'flex',
					gap: { xs: 3, sm: 2 },
					flexDirection: { xs: 'column', sm: 'row' },
				}}
			>
				<Field.Text
					name="firstName"
					label="First name"
					slotProps={{ inputLabel: { shrink: true } }}
				/>
				<Field.Text
					name="lastName"
					label="Last name"
					slotProps={{ inputLabel: { shrink: true } }}
				/>
			</Box>

			<Field.Text
				name="email"
				label="Email address"
				slotProps={{ inputLabel: { shrink: true } }}
			/>

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

			<Button
				fullWidth
				color="inherit"
				size="large"
				type="submit"
				variant="contained"
				loading={isSubmitting}
				loadingIndicator="Create account..."
			>
				Create account
			</Button>
		</Box>
	);

	return (
		<>
			<FormHead
				title="Get started absolutely free"
				description={
					<>
						{`Already have an account? `}
						<Link
							component={RouterLink}
							href={FRONT_PATH_NAMES.auth.login}
							variant="subtitle2"
						>
							Get started
						</Link>
					</>
				}
				sx={{ textAlign: { xs: 'center', md: 'left' } }}
			/>

			{/* {!!errorMessage && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {errorMessage}
                </Alert>
            )} */}

			<Form methods={methods} /* onSubmit={handleSignUp} */>
				{renderForm()}
			</Form>

			<SignUpTerms />
		</>
	);
};

export default SignupForm;
