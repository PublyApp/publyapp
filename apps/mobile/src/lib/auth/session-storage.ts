import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'publy.session-token';
const TENANT_ID_KEY = 'publy.tenant-id';

export type StoredSession = {
	sessionToken: string | null;
	tenantId: string | null;
};

export const readStoredSession = async (): Promise<StoredSession> => {
	const [sessionToken, tenantId] = await Promise.all([
		SecureStore.getItemAsync(SESSION_TOKEN_KEY),
		SecureStore.getItemAsync(TENANT_ID_KEY),
	]);
	return { sessionToken, tenantId };
};

export const writeSessionToken = (sessionToken: string): Promise<void> =>
	SecureStore.setItemAsync(SESSION_TOKEN_KEY, sessionToken);

export const writeTenantId = (tenantId: string): Promise<void> =>
	SecureStore.setItemAsync(TENANT_ID_KEY, tenantId);

export const clearStoredSession = async (): Promise<void> => {
	await Promise.all([
		SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
		SecureStore.deleteItemAsync(TENANT_ID_KEY),
	]);
};
