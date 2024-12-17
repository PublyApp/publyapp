import { Anchor, Button, Checkbox, Group, Paper, PasswordInput, TextInput } from '@mantine/core';
import { useFetcher } from 'react-router';

const LoginForm = () => {
	const fetcher = useFetcher();

	return (
		<Paper withBorder shadow="md" p={30} mt={30} radius="md">
			<fetcher.Form method="post" action="/login">
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
			</fetcher.Form>
		</Paper>
	);
};

export default LoginForm;
