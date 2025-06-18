import { data } from 'react-router';
import type { Route } from './+types/sign-up-page';
import SignUpForm from './sign-up-form';

export const clientLoader = async (_: Route.ClientLoaderArgs) => {
	return data({});
};

const SignUpPage = () => {
	return <SignUpForm />;
};

export default SignUpPage;
