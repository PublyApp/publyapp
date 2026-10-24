/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
	BODY_KEY,
	NO_OVERRIDE,
	withMedia,
	withText,
	withoutText,
} from '~/lib/publishing/destination-overrides';

import { useDestinationOverrides } from './_use-destination-overrides';

describe('useDestinationOverrides', () => {
	test('starts with nothing customized and no tab open', () => {
		const { result } = renderHook(() => useDestinationOverrides());

		expect(result.current.overrides).toEqual({});
		expect(result.current.activeId).toBeNull();
	});

	test('a destination with something to override is customized; emptying it goes back to inheriting', () => {
		const { result } = renderHook(() => useDestinationOverrides());
		const custom = withText(NO_OVERRIDE, BODY_KEY, 'mine');

		act(() => result.current.update('acc-a', custom));
		expect(Object.keys(result.current.overrides)).toEqual(['acc-a']);

		act(() => result.current.update('acc-a', withoutText(custom, BODY_KEY)));
		expect(result.current.overrides).toEqual({});
	});

	test('reset clears one destination only, resetAll clears everything and closes the tab', () => {
		const { result } = renderHook(() => useDestinationOverrides());
		const custom = withText(NO_OVERRIDE, BODY_KEY, 'mine');
		act(() => {
			result.current.update('acc-a', custom);
			result.current.update('acc-b', custom);
			result.current.open('acc-b');
		});

		act(() => result.current.reset('acc-a'));
		expect(Object.keys(result.current.overrides)).toEqual(['acc-b']);
		expect(result.current.activeId).toBe('acc-b');

		act(() => result.current.resetAll());
		expect(result.current.overrides).toEqual({});
		expect(result.current.activeId).toBeNull();
	});

	test('open and close move the active tab', () => {
		const { result } = renderHook(() => useDestinationOverrides());

		act(() => result.current.open('acc-a'));
		expect(result.current.activeId).toBe('acc-a');

		act(() => result.current.close());
		expect(result.current.activeId).toBeNull();
	});

	test('text customized for a segment that was deleted stops counting, and the destination is no longer customized', () => {
		const { result, rerender } = renderHook(
			({ ids }) => useDestinationOverrides(ids),
			{ initialProps: { ids: ['seg-a', 'seg-b'] } },
		);
		act(() =>
			result.current.update('acc-a', withText(NO_OVERRIDE, 'seg-b', 'mine')),
		);
		expect(Object.keys(result.current.overrides)).toEqual(['acc-a']);

		rerender({ ids: ['seg-a'] });

		expect(result.current.overrides).toEqual({});
	});

	test('images switched on with nothing chosen yet keep their editor state', () => {
		const { result } = renderHook(() => useDestinationOverrides([]));

		act(() =>
			result.current.update(
				'acc-a',
				withMedia(NO_OVERRIDE, { imageKeys: null, altTexts: {} }),
			),
		);

		expect(Object.keys(result.current.overrides)).toEqual(['acc-a']);
	});
});
