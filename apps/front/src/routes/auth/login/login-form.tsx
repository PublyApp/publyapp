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

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getSerializedErrorMessage } from '@org/shared-ts/utils/error.utils';
import { getLoginSchema } from '@org/shared-ts/validations/auth.validations';
import { FormHead } from '#app/components/auth/form-head.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useSyncFormToLang } from '#app/hooks/use-sync-form-to-lang.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';

import type { LoginActionResult } from './login-page';

const LoginForm = ({ prefilledEmail = '' }: { prefilledEmail?: string }) => {
	const { t, i18n } = useTranslate();
	const showPassword = useBoolean();
	const fetcher = useFetcher<LoginActionResult>();

	const errorMessage = getSerializedErrorMessage(fetcher.data?.error, t);

	const loginSchema = getLoginSchema(interZodClient);
	const loginResolver = zodResolver(loginSchema);

	const methods = useForm({
		resolver: loginResolver,
		defaultValues: {
			email: prefilledEmail,
			password: '',
		},
	});

	const {
		formState: { isSubmitting },
	} = methods;

	useSyncFormToLang(i18n.language, methods);

	const handleLogin = methods.handleSubmit(async (data) => {
		await fetcher.submit(data, {
			method: 'post',
		});
	});

	const renderForm = () => (
		<Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
			<Field.Text
				name="email"
				label={t('email-address')}
				slotProps={{ inputLabel: { shrink: true } }}
			/>

			<Box sx={{ gap: 1.5, display: 'flex', flexDirection: 'column' }}>
				<Link
					component={RouterLink}
					href="#"
					variant="body2"
					color="inherit"
					sx={{ alignSelf: 'flex-end' }}
				>
					{t('forgot-password')}?
				</Link>

				<Field.Text
					name="password"
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
			</Box>

			<Button
				fullWidth
				color="inherit"
				size="large"
				type="submit"
				variant="contained"
				loading={isSubmitting}
			>
				{t('sign-in')}
			</Button>
		</Box>
	);

	return (
		<>
			<FormHead
				title={t('sign-in')}
				description={
					<>
						{t('no-account-yet')}{' '}
						<Link
							component={RouterLink}
							href={FRONT_PATH_NAMES.auth.signup}
							variant="subtitle2"
						>
							{t('create-an-account')}
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
