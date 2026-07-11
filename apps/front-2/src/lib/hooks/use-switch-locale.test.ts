/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidate: vi.fn(),
	setLocale: vi.fn(),
	postBroadcast: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	useRouter: () => ({ invalidate: mocks.invalidate }),
}));

vi.mock('@tanstack/react-start', () => ({
	useServerFn: (fn: unknown) => fn,
}));

vi.mock('~/server/i18n-locale', () => ({
	setLocale: mocks.setLocale,
}));

vi.mock('~/lib/tab-sync/broadcast-sync', () => ({
	LOCALE_SYNC_CHANNEL: 'publyapp:locale-sync',
	postBroadcast: mocks.postBroadcast,
}));

import { useSwitchLocale } from './use-switch-locale';

describe('useSwitchLocale', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.setLocale.mockResolvedValue({ locale: 'fr' });
		mocks.invalidate.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test('persists the cookie, broadcasts, and invalidates the router', async () => {
		const { result } = renderHook(() => useSwitchLocale());

		act(() => {
			result.current.switchLocale('fr');
		});

		await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1));

		expect(mocks.setLocale).toHaveBeenCalledWith({ data: { locale: 'fr' } });
		expect(mocks.postBroadcast).toHaveBeenCalledWith('publyapp:locale-sync', {
			locale: 'fr',
		});
	});

	test('ignores a second switch call while the first is still in flight', async () => {
		let resolveSetLocale: () => void = () => {};
		mocks.setLocale.mockReturnValue(
			new Promise((resolve) => {
				resolveSetLocale = () => resolve({ locale: 'fr' });
			}),
		);

		const { result } = renderHook(() => useSwitchLocale());

		act(() => {
			result.current.switchLocale('fr');
		});
		expect(result.current.isSwitching).toBe(true);

		act(() => {
			result.current.switchLocale('en');
		});

		expect(mocks.setLocale).toHaveBeenCalledTimes(1);
		expect(mocks.setLocale).toHaveBeenCalledWith({ data: { locale: 'fr' } });

		resolveSetLocale();
		await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1));
	});
});
