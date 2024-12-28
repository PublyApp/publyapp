import { Anchor, Box, Text, Title } from '@mantine/core';
import { data } from 'react-router';

import { getLoginSchema } from '@/shared/validations/auth.validations';

import type { Route } from './+types/LoginPage';
import LoginForm from './LoginForm';
import { classes } from './LoginPage.css';

// TODO: implement geServerAction: it needs to initialize a CustomZod instance
export const action = async ({ request }: Route.ActionArgs) => {
	const formData = await request.formData();

	const email = formData.get('email');
	const password = formData.get('password');

	// const result = getLoginSchema().safeParse({
	// 	email,
	// 	password,
	// });

	// if (!result.success) {
	// 	return data({
	// 		error: result.error,
	// 	});
	// }

	// console.log('🚀🚀🚀', {
	// 	email,
	// 	password,
	// });

	// return data({
	// 	// test: new Map([
	// 	// 	['email', _.toString(email)],
	// 	// 	['password', _.toString(password)],
	// 	// ]),
	// 	message: 'hello',
	// });
};

const LoginPage = ({ actionData }: Route.ComponentProps) => {
	console.log('🙏🙏🙏🙏', actionData);

	return (
		<Box w={420} my={40}>
			<Title ta="center" className={classes.title}>
				Welcome back!
			</Title>
			<Text c="dimmed" size="sm" ta="center" mt={5}>
				Do not have an account yet?{' '}
				<Anchor size="sm" component="button">
					Create account
				</Anchor>
			</Text>

			<LoginForm />
		</Box>
	);
};

export default LoginPage;
