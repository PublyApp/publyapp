import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	postBroadcast: vi.fn(),
}));

vi.mock('~/lib/tab-sync/broadcast-sync', () => ({
	LOCALE_SYNC_CHANNEL: 'publyapp:locale-sync',
	postBroadcast: mocks.postBroadcast,
}));

import {
	applyLocale,
	parseLocaleSyncMessage,
	switchLocale,
} from './locale-switch';

describe('applyLocale', () => {
	test('invalidates the router', async () => {
		const invalidate = vi.fn().mockResolvedValue(undefined);
		await applyLocale({ invalidate });
		expect(invalidate).toHaveBeenCalledTimes(1);
	});
});

describe('switchLocale', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test('persists the cookie, broadcasts once, then invalidates the router', async () => {
		const invalidate = vi.fn().mockResolvedValue(undefined);
		const setLocaleFn = vi.fn().mockResolvedValue({ locale: 'fr' });

		await switchLocale('fr', { invalidate }, setLocaleFn);

		expect(setLocaleFn).toHaveBeenCalledWith({ data: { locale: 'fr' } });
		expect(mocks.postBroadcast).toHaveBeenCalledWith('publyapp:locale-sync', {
			locale: 'fr',
		});
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	test('broadcasts only after the server-side cookie write settles, before invalidating', async () => {
		const invalidate = vi.fn().mockResolvedValue(undefined);
		let resolveSetLocale: () => void = () => {};
		const setLocaleFn = vi.fn().mockReturnValue(
			new Promise((resolve) => {
				resolveSetLocale = () => resolve({ locale: 'fr' });
			}),
		);

		const switchPromise = switchLocale('fr', { invalidate }, setLocaleFn);

		expect(mocks.postBroadcast).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();

		resolveSetLocale();
		await switchPromise;

		expect(mocks.postBroadcast).toHaveBeenCalledTimes(1);
		expect(invalidate).toHaveBeenCalledTimes(1);
		const broadcastOrder = mocks.postBroadcast.mock.invocationCallOrder[0];
		const invalidateOrder = invalidate.mock.invocationCallOrder[0];
		expect(broadcastOrder).toBeLessThan(invalidateOrder);
	});
});

describe('parseLocaleSyncMessage', () => {
	test('returns the locale for a valid supported-language payload', () => {
		expect(parseLocaleSyncMessage({ locale: 'fr' })).toBe('fr');
		expect(parseLocaleSyncMessage({ locale: 'en' })).toBe('en');
	});

	test('returns null for an unsupported locale', () => {
		expect(parseLocaleSyncMessage({ locale: 'de' })).toBeNull();
	});

	test('returns null for a malformed payload', () => {
		expect(parseLocaleSyncMessage(null)).toBeNull();
		expect(parseLocaleSyncMessage(undefined)).toBeNull();
		expect(parseLocaleSyncMessage({})).toBeNull();
		expect(parseLocaleSyncMessage({ locale: 42 })).toBeNull();
		expect(parseLocaleSyncMessage('fr')).toBeNull();
	});
});
