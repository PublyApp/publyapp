import { PropsWithChildren, createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { User } from '@devist/shared/types/user.types';

import { LogInFnInput } from '../../reactQuery/queryFns/logIn.fn';
import { useLogInQuery } from '../../hooks/useLogInQuery';
import { useLogOutQuery } from '../../hooks/useLogOutQuery';

type AuthContextType = {
	user: User | null;
	setUser: (user: User) => void;
	token: string;
	isAuthed: boolean;
	logIn: (input: LogInFnInput) => Promise<void>;
	isLogInLoading: boolean;
	logOut: () => Promise<void>;
	isLogOutLoading: boolean;
};

export const AuthContext = createContext<AuthContextType>({
	user: null,
	setUser: () => {},
	token: '',
	isAuthed: false,
	logIn: async () => {},
	isLogInLoading: false,
	logOut: async () => {},
	isLogOutLoading: false,
});

export const AuthProvider = ({ children }: PropsWithChildren) => {
	const getCurrentUser = () => {
		return Parse.User.current();
	};

	const [user, setUser] = useState<User | null>(getCurrentUser()?.toJSON() as unknown as User);
	const [token, setToken] = useState<string>(getCurrentUser()?.getSessionToken() || '');
	const [isAuthed, setIsAuthed] = useState<boolean>(false);

	const { triggerLogIn, logInResult, isLogInSuccess, isLogInFetching } = useLogInQuery();
	const { triggerLogOut, isLogOutSuccess, isLogOutFetching } = useLogOutQuery();

	useEffect(() => {
		setIsAuthed(!!token);
	}, [token]);

	useEffect(() => {
		if (!isLogInFetching && isLogInSuccess && logInResult) {
			const loggedUser = logInResult;
			const userJSON = loggedUser.toJSON() as unknown as User;
			setUser(userJSON);
			setToken(loggedUser.getSessionToken());
		}
	}, [isLogInFetching, isLogInSuccess, logInResult]);

	useEffect(() => {
		if (!isLogOutFetching && isLogOutSuccess) {
			// setUser(getCurrentUser()?.toJSON() as unknown as User);
			// setToken(getCurrentUser()?.getSessionToken());
			setUser(null);
			setToken('');
		}
	}, [isLogOutFetching, isLogOutSuccess]);

	const logIn = useCallback(
		async (input: LogInFnInput) => {
			triggerLogIn(input);
		},
		[triggerLogIn],
	);

	const logOut = useCallback(async () => {
		await triggerLogOut();
	}, [triggerLogOut]);

	const memoizedValue = useMemo<AuthContextType>(() => {
		return {
			user,
			setUser,
			token,
			isAuthed,
			logIn,
			isLogInLoading: isLogInFetching,
			logOut,
			isLogOutLoading: isLogOutFetching,
		};
	}, [isAuthed, isLogInFetching, isLogOutFetching, logIn, logOut, token, user]);

	return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
};
