import { LocalStorageBrowserStorageAdapter } from './adapters/local-storage-browser-storage-adapter';
import { MemoryBrowserStorageAdapter } from './adapters/memory-browser-storage-adapter';
import { BrowserStorage } from './browser-storage';
import type { IBrowserStorage } from './browser-storage.types';

const isBrowser = typeof window !== 'undefined';

const adapter: IBrowserStorage = isBrowser
	? new LocalStorageBrowserStorageAdapter()
	: new MemoryBrowserStorageAdapter();

export const browserStorage = new BrowserStorage(adapter);
