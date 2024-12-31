import { Anchor, Button, Checkbox, Group, Paper, PasswordInput, TextInput } from '@mantine/core';
import { useForm } from 'react-hook-form';
import { useFetcher } from 'react-router';

import { RHFForm } from '@/front/components/react-hook-form/RHFForm';

const LoginForm = () => {
	const fetcher = useFetcher();

	// fetcher.submit({});
	// const form = useForm();

	return (
		<Paper withBorder shadow="md" p={30} mt={30} radius="md">
			<fetcher.Form method="post">
				{/* <RHFForm
				form={form}
				onSubmit={() => {
					fetcher.submit(form.getValues());
				}}
			> */}
				<TextInput label="Email" placeholder="your email" name="email" />
				<PasswordInput label="Password" placeholder="Your password" mt="md" name="password" />
				<Group justify="space-between" mt="lg">
					<Checkbox label="Remember me" />
					<Anchor component="button" size="sm">
						Forgot password?
					</Anchor>
				</Group>
				<Button fullWidth mt="xl" type="submit">
					Sign in
				</Button>
				{/* </RHFForm> */}
			</fetcher.Form>
		</Paper>
	);
};

export default LoginForm;
