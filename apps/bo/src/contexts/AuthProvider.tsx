import { PropsWithChildren, createContext, useCallback, useMemo, useState } from 'react';

import { IUser } from '@aktivpost/shared/types/user.types';
import { IRole } from '@aktivpost/shared/types/role.types';

import { ROLES_LOCAL_STORAGE_KEY } from '../utils/constants';
import useLocalStorage from '../hooks/useLocalStorage';

type AuthContextType = {
	isAuthed: boolean;
	user?: IUser;
	roles: IRole[];
	syncUserState: () => void;
	refetchUser: () => void;
};

export const AuthContext = createContext<AuthContextType>({
	isAuthed: false,
	user: undefined,
	roles: [],
	syncUserState: () => {},
	refetchUser: () => {},
});

export const AuthProvider = ({ children }: PropsWithChildren) => {
	const getAuthStatus = () => {
		const user = Parse.User.current();

		if (!user) {
			return false;
		}

		if (!user.getSessionToken()) {
			return false;
		}

		return true;
	};

	const getAuthedUser = (): IUser | undefined => {
		return Parse.User.current<Parse.User<IUser>>()?.toJSON() as any;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [isAuthed, setIsAuthed] = useState<boolean>(getAuthStatus());
	const [user, setUser] = useState<IUser | undefined>(getAuthedUser());
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [roles, setRoles] = useLocalStorage<IRole[]>(ROLES_LOCAL_STORAGE_KEY, []);

	const syncUserState = useCallback(() => {
		setUser(getAuthedUser());
	}, []);

	const refetchUser = useCallback(() => {
		const run = async () => {
			const iUser = Parse.User.current();
			const result = await iUser?.fetch();
			setUser(result?.toJSON() as any);
		};

		run();
	}, []);

	const memoizedValue = useMemo<AuthContextType>(() => {
		return {
			isAuthed,
			user,
			roles,
			syncUserState,
			refetchUser,
		};
	}, [isAuthed, refetchUser, roles, syncUserState, user]);

	return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
};
