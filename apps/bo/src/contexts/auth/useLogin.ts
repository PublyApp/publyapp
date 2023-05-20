import { useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { LogInFnInput, logInFn } from '../../reactQuery/queryFns/logIn.fn';

export const useLogin = () => {
	const [loginInput, setLoginInput] = useState<LogInFnInput>({ email: '', password: '' });

	const { data: logInResult, refetch: refetchLogin } = useQuery({
		queryKey: ['logIn', loginInput],
		queryFn: logInFn,
		enabled: false,
	});

	useEffect(() => {
		if (loginInput.email && loginInput.password) {
			refetchLogin();
		}
	}, [loginInput, refetchLogin]);

	const logIn = (input: LogInFnInput) => {
		setLoginInput(input);
	};

	return { logIn, logInResult };
};
