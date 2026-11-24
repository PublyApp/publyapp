import { describe, expect, test } from 'vitest';

import { MemoryBrowserStorageAdapter } from './adapters/memory-browser-storage-adapter';
import { BrowserStorage } from './browser-storage';
import type { IBrowserStorage } from './browser-storage.types';

class ThrowingBrowserStorageAdapter implements IBrowserStorage {
	get(): string | null {
		throw new Error('storage unavailable');
	}

	set(): void {
		throw new Error('storage unavailable');
	}

	remove(): void {
		throw new Error('storage unavailable');
	}
}

describe('BrowserStorage', () => {
	test('reads, writes and removes through the injected adapter', () => {
		const storage = new BrowserStorage(new MemoryBrowserStorageAdapter());

		expect(storage.get('missing')).toBeNull();

		storage.set('key', 'value');
		expect(storage.get('key')).toBe('value');

		storage.remove('key');
		expect(storage.get('key')).toBeNull();
	});

	test('returns null and swallows adapter errors (private mode)', () => {
		const storage = new BrowserStorage(new ThrowingBrowserStorageAdapter());

		expect(storage.get('key')).toBeNull();

		expect(() => storage.set('key', 'value')).not.toThrow();
		expect(() => storage.remove('key')).not.toThrow();
	});
});
