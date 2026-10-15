/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { useTextCounter } from './use-text-counter';

const destinations = [
	{
		label: '@a.bsky.social',
		limits: { maxTextGraphemes: 300, maxTextBytes: 3000 },
	},
];

describe('useTextCounter', () => {
	test('tracks the text as it changes', () => {
		const { result, rerender } = renderHook(
			({ text }) => useTextCounter(text, destinations),
			{ initialProps: { text: 'hello' } },
		);
		expect(result.current).toMatchObject({ state: 'ok', actual: 5 });

		rerender({ text: 'a'.repeat(301) });
		expect(result.current).toMatchObject({ state: 'error', actual: 301 });
	});

	test('is null without destinations', () => {
		const { result } = renderHook(() => useTextCounter('hello', []));
		expect(result.current).toBeNull();
	});
});
