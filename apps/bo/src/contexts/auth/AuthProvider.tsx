import { PropsWithChildren, createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { User } from '@devist/shared/types/user.types';

import { LogInFnInput } from '../../reactQuery/queryFns/logIn.fn';

import { useLogin } from './useLogin';

type AuthContextType = {
	user: User | null;
	token?: string;
	isAuthed: boolean;
	logIn: (input: LogInFnInput) => Promise<void>;
	logOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({
	user: null,
	isAuthed: false,
	logIn: async () => {},
	logOut: async () => {},
});

export const AuthProvider = ({ children }: PropsWithChildren) => {
	const [token, setToken] = useState<string | undefined>(() => {
		return Parse.User.current()?.getSessionToken();
	});
	const [user, setUser] = useState<User | null>(() => {
		return Parse.User.current()?.toJSON() as unknown as User;
	});
	const [isAuthed, setIsAuthed] = useState<boolean>(false);

	const { logIn: triggerLogIn, logInResult } = useLogin();

	useEffect(() => {
		setIsAuthed(!!token);
	}, [token]);

	useEffect(() => {
		if (logInResult) {
			const loggedUser = logInResult;
			const userJSON = loggedUser.toJSON() as unknown as User;
			setUser(userJSON);
			setToken(loggedUser.getSessionToken());
		}
	}, [logInResult]);

	const logIn = useCallback(
		async (input: LogInFnInput) => {
			triggerLogIn(input);
		},
		[triggerLogIn],
	);

	const logOut = async () => {};

	const memoizedValue = useMemo<AuthContextType>(() => {
		return {
			user,
			token,
			isAuthed,
			logIn,
			logOut,
		};
	}, [isAuthed, logIn, token, user]);
	return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
};
