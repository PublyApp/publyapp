import { useSyncExternalStore } from 'react';
import {
	readSelectedTenantId,
	SELECTED_TENANT_STORAGE_KEY,
	writeSelectedTenantId,
} from '~/lib/selected-tenant-storage';

// `localStorage` fires `storage` events only in OTHER tabs; selection changes
// made in this tab go through the setter below, which notifies listeners
// explicitly. Module-level set: every mounted consumer shares one store.
const listeners = new Set<() => void>();

const subscribe = (onStoreChange: () => void): (() => void) => {
	listeners.add(onStoreChange);
	const onStorage = (event: StorageEvent): void => {
		if (event.key === SELECTED_TENANT_STORAGE_KEY) {
			onStoreChange();
		}
	};
	window.addEventListener('storage', onStorage);

	return () => {
		listeners.delete(onStoreChange);
		window.removeEventListener('storage', onStorage);
	};
};

const getSnapshot = (): string | null => readSelectedTenantId();

const setSelectedTenantId = (tenantId: string): void => {
	// Persists the value AND notifies subscribers in this tab (cross-tab
	// updates arrive through the `storage` event).
	writeSelectedTenantId(tenantId);
	for (const listener of listeners) {
		listener();
	}
};

/**
 * Reactive read access to the persisted tenant-workspace preference.
 *
 * Backed by `useSyncExternalStore` so the first client render uses the same
 * stable server snapshot (`null`) the server rendered — reading localStorage
 * in a `useState` initializer makes hydration output depend on browser-only
 * state (react-doctor/no-hydration-branch-on-browser-global). After mount
 * `useSyncExternalStore` re-renders with the real stored value, so the
 * workspace still resolves on deep links and reloads.
 *
 * The returned setter persists the value AND notifies subscribers in this
 * tab (cross-tab updates arrive through the `storage` event).
 */
export const useSelectedTenantId = (): [
	string | null,
	(tenantId: string) => void,
] => {
	const selectedTenantId = useSyncExternalStore(
		subscribe,
		getSnapshot,
		// Server snapshot: the server never sees localStorage.
		() => null,
	);

	return [selectedTenantId, setSelectedTenantId];
};
