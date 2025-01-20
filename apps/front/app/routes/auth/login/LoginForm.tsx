import { zodResolver } from '@hookform/resolvers/zod';
import { Anchor, Button, Group, Paper, PasswordInput } from '@mantine/core';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';

import { RHFForm } from '@/front/components/react-hook-form/RHFForm';
import { RHFTextInput } from '@/front/components/react-hook-form/RHFTextInput';
import { defaultZodClient } from '@/front/lib/zod';
import { getLoginSchema } from '@/shared/validations/auth.validations';

const LoginForm = () => {
	const { i18n } = useTranslation();
	i18n.loadNamespaces(['zod']);

	const fetcher = useFetcher<{
		email: string;
		password: string;
	}>();

	const form = useForm({
		resolver: zodResolver(getLoginSchema(defaultZodClient)),
		defaultValues: {
			email: '',
			password: '',
		},
	});

	const handleLogin = form.handleSubmit(
		(data) => {
			console.log('✅✅✅', data);
			fetcher.submit(data);
		},
		(errors) => {
			console.log('❌❌❌', errors);
		},
	);

	return (
		<Paper withBorder shadow="md" p={30} mt={30} radius="md">
			<RHFForm form={form}>
				<RHFTextInput label="Email" placeholder="your email" name="email" />
				<PasswordInput label="Password" placeholder="Your password" mt="md" name="password" type="number" />
				<Button fullWidth mt="xl" onClick={handleLogin}>
					Sign in
				</Button>
			</RHFForm>
			<Group justify="end" mt="lg">
				<Anchor component="button" size="sm">
					Forgot password?
				</Anchor>
			</Group>
		</Paper>
	);
};

export default LoginForm;
