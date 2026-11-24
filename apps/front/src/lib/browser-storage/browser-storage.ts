import type { IBrowserStorage } from './browser-storage.types';

/**
 * Browser storage service (#2510): the single place that touches browser
 * storage. Every operation is wrapped in a try/catch because `localStorage`
 * throws in private mode; on error, reads return null and writes are dropped,
 * so a storage failure degrades to defaults instead of crashing the caller.
 */
export class BrowserStorage {
	readonly #adapter: IBrowserStorage;

	constructor(adapter: IBrowserStorage) {
		this.#adapter = adapter;
	}

	get(key: string): string | null {
		try {
			return this.#adapter.get(key);
		} catch {
			return null;
		}
	}

	set(key: string, value: string): void {
		try {
			this.#adapter.set(key, value);
		} catch {
			// Storage unavailable (private mode, quota, blocked): drop the write.
		}
	}

	remove(key: string): void {
		try {
			this.#adapter.remove(key);
		} catch {
			// Storage unavailable: nothing to remove, nothing to fail on.
		}
	}
}
