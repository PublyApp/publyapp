import { zodResolver } from '@hookform/resolvers/zod';
import { Anchor, Button, Group, Paper } from '@mantine/core';
import { useForm } from 'react-hook-form';
import { useFetcher } from 'react-router';

import { RHFForm } from '@/front/components/react-hook-form/RHFForm';
import { RHFPasswordInput } from '@/front/components/react-hook-form/RHFPasswordInput';
import { RHFTextInput } from '@/front/components/react-hook-form/RHFTextInput';
import { defaultZodClient } from '@/front/lib/zod';
import { getLoginSchema } from '@/shared/validations/auth.validations';

const LoginForm = () => {
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

	const handleLogin = form.handleSubmit((data) => {
		fetcher.submit(data, {
			method: 'post',
		});
	});

	return (
		<Paper withBorder shadow="md" p={30} mt={30} radius="md">
			<RHFForm form={form} onSubmit={handleLogin}>
				<RHFTextInput name="email" label="Email" placeholder="your email" />
				<RHFPasswordInput name="password" label="Password" placeholder="Your password" mt="md" />
				<Button fullWidth mt="xl" type="submit">
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
