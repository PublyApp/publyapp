import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useFetcher } from 'react-router';

import { defaultZodClient } from '@/front/lib/zod';
import { getLoginSchema } from '@/shared/validations/auth.validations';

const LoginForm = () => {
	const fetcher = useFetcher<{
		email: string;
		password: string;
	}>();

	const isLoading = fetcher.state === 'loading';

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

	return <h1>Login form</h1>;
};

export default LoginForm;
