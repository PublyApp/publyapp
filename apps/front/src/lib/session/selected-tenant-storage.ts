import { browserStorage } from '~/lib/browser-storage/browser-storage-instance';

export const SELECTED_TENANT_STORAGE_KEY = 'publyapp:selected-tenant-id';

const isBrowser = typeof window !== 'undefined';

/**
 * The tenant workspace the user last entered, persisted so a deep link (or a
 * reload) on any `/tenant/*` route resolves back to the workspace instead of
 * dropping the user into the org picker (MAJOR — review #1131 round 2). A
 * pure UI preference, like the persisted color scheme and sidebar state in
 * `ui-store.ts`: the tenant-scoped session cookie, not this value, is what
 * authorizes the API requests. Read through the same defensive browser-storage
 * access the rest of the app uses.
 */
export const readSelectedTenantId = (): string | null => {
	if (!isBrowser) {
		return null;
	}

	const value = browserStorage.get(SELECTED_TENANT_STORAGE_KEY);
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return null;
};

export const writeSelectedTenantId = (tenantId: string): void => {
	if (!isBrowser) {
		return;
	}

	browserStorage.set(SELECTED_TENANT_STORAGE_KEY, tenantId);
};

export const clearSelectedTenantId = (): void => {
	if (!isBrowser) {
		return;
	}

	browserStorage.remove(SELECTED_TENANT_STORAGE_KEY);
};
