import { PropsWithChildren, createContext, useEffect, useMemo, useState } from 'react';

import { User } from '@devist/shared/types/user.types';

type AuthContextType = {
	user: User | null;
	token?: string;
	isAuthed: boolean;
	logIn: () => Promise<void>;
	logOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({
	user: null,
	isAuthed: false,
	logIn: async () => {},
	logOut: async () => {},
});

export const AuthProvider = ({ children }: PropsWithChildren) => {
	const [token, setToken] = useState<string | undefined>();
	const [user, setUser] = useState<User | null>(null);
	const [isAuthed, setIsAuthed] = useState<boolean>(false);

	useEffect(() => {
		setIsAuthed(!!token);
	}, [token]);

	const logIn = async () => {};

	const logOut = async () => {};

	const memoizedValue = useMemo<AuthContextType>(() => {
		return {
			user,
			token,
			isAuthed,
			logIn,
			logOut,
		};
	}, [isAuthed, token, user]);
	return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
};
