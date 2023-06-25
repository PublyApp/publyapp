import { PropsWithChildren, createContext, useCallback, useMemo, useState, useEffect } from 'react';

// import Parse from 'parse';
import { useLocalStorage } from 'react-use';

import { IUser } from '@aktiveo/shared/types/user.types';
import { IRole } from '@aktiveo/shared/types/role.types';
import { ROLES_LOCAL_STORAGE_KEY } from '@aktiveo/ui-react/utils/constants';

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
		if (!(typeof window !== 'undefined')) return false;

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
		if (!(typeof window !== 'undefined')) return undefined;

		return Parse.User.current<Parse.User<IUser>>()?.toJSON() as any;
	};

	const [isAuthed, setIsAuthed] = useState<boolean>(getAuthStatus());
	const [user, setUser] = useState<IUser | undefined>(getAuthedUser());
	const [roles, setRoles] = useLocalStorage<IRole[]>(ROLES_LOCAL_STORAGE_KEY, []);

	useEffect(() => {
		setIsAuthed(getAuthStatus());
		setRoles(JSON.parse(localStorage.getItem(ROLES_LOCAL_STORAGE_KEY) as any));
	}, [setRoles, user]);

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
			roles: roles || [],
			syncUserState,
			refetchUser,
		};
	}, [isAuthed, refetchUser, roles, syncUserState, user]);

	return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
};
