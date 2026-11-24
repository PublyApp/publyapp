import type { IBrowserStorage } from '../browser-storage.types';

export class MemoryBrowserStorageAdapter implements IBrowserStorage {
	private readonly values = new Map<string, string>();

	get(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	set(key: string, value: string): void {
		this.values.set(key, value);
	}

	remove(key: string): void {
		this.values.delete(key);
	}
}
