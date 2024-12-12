import { useEffect } from 'react';

import { Box, Button, PasswordInput, TextInput } from '@mantine/core';
import _ from 'lodash';
import { Form } from 'react-router';

import type { Route } from './+types/LoginPage';

export const action = async ({ request }: Route.ActionArgs) => {
	const formData = await request.formData();

	const email = formData.get('email');
	const password = formData.get('password');

	console.log('🚀🚀🚀', {
		email,
		password,
	});

	return {
		// test: new Map([
		// 	['email', _.toString(email)],
		// 	['password', _.toString(password)],
		// ]),
		message: 'hello',
	};
};

const LoginPage = ({ actionData }: Route.ComponentProps) => {
	console.log('🙏🙏🙏🙏', actionData);

	useEffect(() => {
		console.log('😂😂');
	});

	return (
		<Box>
			<Form method="post" navigate={false}>
				<TextInput label="Email" name="email" />
				<PasswordInput label="Password" name="password" />
				<Button type="submit" variant="primary">
					Log in
				</Button>
			</Form>
		</Box>
	);
};

export default LoginPage;
