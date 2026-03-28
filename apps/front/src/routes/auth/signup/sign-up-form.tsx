import { zodResolver } from '@hookform/resolvers/zod';
import { Alert } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import { useBoolean } from 'minimal-shared/hooks';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getRegisterSchema } from '@org/shared-ts/validations/auth.validations';
import { FormHead } from '#app/components/auth/form-head.tsx';
import { SignUpTerms } from '#app/components/auth/sign-up-terms.tsx';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useSyncFormToLang } from '#app/hooks/use-sync-form-to-lang.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';

// ----------------------------------------------------------------------

export type SignUpSchemaType = z.infer<ReturnType<typeof getRegisterSchema>>;

// ----------------------------------------------------------------------

const SignupForm = () => {
	const { t, i18n } = useTranslate();
	const showPassword = useBoolean();

	const methods = useForm({
		disabled: true,
		resolver: zodResolver(getRegisterSchema(interZodClient)),
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

	useSyncFormToLang(i18n.language, methods);

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
					label={t('firstname')}
					slotProps={{ inputLabel: { shrink: true } }}
				/>
				<Field.Text
					name="lastName"
					label={t('lastname')}
					slotProps={{ inputLabel: { shrink: true } }}
				/>
			</Box>

			<Field.Text
				name="email"
				label={t('email-address')}
				slotProps={{ inputLabel: { shrink: true } }}
			/>

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

			<Button
				fullWidth
				color="inherit"
				size="large"
				type="submit"
				variant="contained"
				loading={isSubmitting}
				disabled
			>
				{t('create-account')}
			</Button>
		</Box>
	);

	return (
		<>
			<Alert severity="info" sx={{ mb: 2 }}>
				{t('signup-are-disabled')}
			</Alert>
			<FormHead
				title={t('signup-title')}
				description={
					<>
						{t('already-have-account-question')}{' '}
						<Link
							component={RouterLink}
							href={FRONT_PATH_NAMES.auth.login}
							variant="subtitle2"
						>
							{t('login')}
						</Link>
					</>
				}
				sx={{ textAlign: { xs: 'center', md: 'left' } }}
			/>

			<Form methods={methods}>{renderForm()}</Form>

			<SignUpTerms />
		</>
	);
};

export default SignupForm;
