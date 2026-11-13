/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: { size?: string }) =>
			`${key}:${options?.size ?? ''}`,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));
vi.mock('./_use-attach-deferred-images', () => ({
	useAttachDeferredImages: () => ({ isPending: false, attach: vi.fn() }),
}));
vi.mock('./_use-raise-session-end', () => ({
	useRaiseSessionEnd: () => () => false,
}));

import type { DeferredImageSelection } from './_post-image-picker';
import { useImageHandoff } from './_use-image-handoff';

const file = (name: string, bytes: number) =>
	new File([new Uint8Array(bytes)], name, { type: 'image/png' });

const LIMITS = {
	maxImages: 4,
	maxImageBytes: 1_000_000,
	acceptedImageContentTypes: ['image/png'],
};

const small: DeferredImageSelection = {
	id: 'small',
	file: file('small.png', 10),
	altText: '',
};
const big: DeferredImageSelection = {
	id: 'big',
	file: file('big.png', 1_000_001),
	altText: '',
};

describe('useImageHandoff (queued files above the cap)', () => {
	test('drops the queued files a stricter cap no longer allows, and says why', () => {
		const { result } = renderHook(() => useImageHandoff('tenant-1', LIMITS));

		act(() => result.current.setDeferredImages([small, big]));

		expect(result.current.deferredImages).toEqual([small]);
		expect(result.current.oversizeNotice).toBe('image-too-large:1 MB');
	});

	test('with unknown limits the server cap applies', () => {
		const { result } = renderHook(() => useImageHandoff('tenant-1', null));

		act(() =>
			result.current.setDeferredImages([
				{ id: 'huge', file: file('huge.png', 2_000_001), altText: '' },
			]),
		);

		expect(result.current.deferredImages).toEqual([]);
		expect(result.current.oversizeNotice).toBe('image-too-large:2 MB');
	});

	test('keeps everything, with no notice, when every file fits', () => {
		const { result } = renderHook(() => useImageHandoff('tenant-1', LIMITS));

		act(() => result.current.setDeferredImages([small]));

		expect(result.current.deferredImages).toEqual([small]);
		expect(result.current.oversizeNotice).toBe('');
	});
});
