import SignUpForm from './sign-up-form';
import type { Route } from './+types/sign-up-page';
import { data } from 'react-router';

export const clientLoader = async (_: Route.ClientLoaderArgs) => {
	return data({});
};

const SignUpPage = () => {
	return (
		<>
			<SignUpForm />
		</>
	);
};

export default SignUpPage;
