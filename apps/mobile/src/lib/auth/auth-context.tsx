import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import { ApiError, apiRequest } from '@/lib/api/client';
import type { ApiRequestOptions } from '@/lib/api/client';
import type { LoginResponse } from '@/lib/api/types';
import {
	clearStoredSession,
	readStoredSession,
	writeSessionToken,
	writeTenantId,
} from '@/lib/auth/session-storage';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export type AuthContextValue = {
	status: AuthStatus;
	tenantId: string | null;
	signIn: (email: string, password: string) => Promise<void>;
	signOut: () => Promise<void>;
	selectTenant: (tenantId: string) => Promise<void>;
	request: <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: PropsWithChildren) => {
	const [status, setStatus] = useState<AuthStatus>('loading');
	const [sessionToken, setSessionToken] = useState<string | null>(null);
	const [tenantId, setTenantId] = useState<string | null>(null);

	useEffect(() => {
		const hydrate = async () => {
			try {
				const stored = await readStoredSession();
				setSessionToken(stored.sessionToken);
				setTenantId(stored.tenantId);
				setStatus(stored.sessionToken ? 'signed-in' : 'signed-out');
			} catch {
				setStatus('signed-out');
			}
		};
		void hydrate();
	}, []);

	const signOut = useCallback(async () => {
		await clearStoredSession();
		setSessionToken(null);
		setTenantId(null);
		setStatus('signed-out');
	}, []);

	const signIn = useCallback(async (email: string, password: string) => {
		const result = await apiRequest<LoginResponse>('/auth/login', {
			method: 'POST',
			body: { email, password },
		});
		// A fresh login never inherits the previous account's tenant.
		await clearStoredSession();
		await writeSessionToken(result.sessionToken);
		setSessionToken(result.sessionToken);
		setTenantId(null);
		setStatus('signed-in');
	}, []);

	const selectTenant = useCallback(async (nextTenantId: string) => {
		await writeTenantId(nextTenantId);
		setTenantId(nextTenantId);
	}, []);

	// Only a 401 signs the user out — 403 must keep the session (same rule as
	// apps/front). The token itself is never logged.
	const request = useCallback(
		async <T,>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
			try {
				return await apiRequest<T>(path, {
					...options,
					sessionToken,
					tenantId,
				});
			} catch (error) {
				if (error instanceof ApiError && error.status === 401) {
					await signOut();
				}
				throw error;
			}
		},
		[sessionToken, tenantId, signOut],
	);

	const value = useMemo<AuthContextValue>(
		() => ({ status, tenantId, signIn, signOut, selectTenant, request }),
		[status, tenantId, signIn, signOut, selectTenant, request],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
	const context = useContext(AuthContext);
	if (context === null) {
		throw new Error('useAuth must be used inside <AuthProvider>');
	}
	return context;
};
