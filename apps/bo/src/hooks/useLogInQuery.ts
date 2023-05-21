import { useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { LogInFnInput, logInFn } from '../reactQuery/queryFns/logIn.fn';

export const useLogInQuery = () => {
	const [loginInput, setLoginInput] = useState<LogInFnInput>({ email: '', password: '' });

	const {
		data: logInResult,
		refetch: refetchLogin,
		isLoading: isLogInLoading,
		isSuccess: isLogInSuccess,
		isFetching: isLogInFetching,
	} = useQuery({
		queryKey: ['logIn', loginInput],
		queryFn: logInFn,
		enabled: false,
		cacheTime: 0,
		retry: false,
	});

	useEffect(() => {
		if (loginInput.email && loginInput.password) {
			refetchLogin();
		}
	}, [loginInput, refetchLogin]);

	const triggerLogIn = (input: LogInFnInput) => {
		setLoginInput(input);
	};

	return { triggerLogIn, logInResult, isLogInLoading, isLogInSuccess, isLogInFetching };
};
