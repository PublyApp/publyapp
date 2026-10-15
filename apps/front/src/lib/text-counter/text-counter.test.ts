import { describe, expect, test } from 'vitest';

import { countText, tightestLimit } from './text-counter';
import fixtures from './text-counter-fixtures.json';

const BLUESKY = { maxTextGraphemes: 300, maxTextBytes: 3000 };

describe('countText', () => {
	// The API runs the same file (Publishing/Lib/TextCounter.Spec.cs).
	test.each(fixtures)('$name agrees with the server fixture', (fixture) => {
		expect(countText(fixture.text)).toEqual({
			graphemes: fixture.browserGraphemes ?? fixture.graphemes,
			bytes: fixture.bytes,
		});
	});
});

describe('tightestLimit', () => {
	const bluesky = { label: '@a.bsky.social', limits: BLUESKY };

	test('is null without a destination', () => {
		expect(tightestLimit(countText('hi'), [])).toBeNull();
	});

	test('is ok below 90 percent', () => {
		expect(tightestLimit(countText('a'.repeat(269)), [bluesky])).toMatchObject({
			state: 'ok',
			actual: 269,
			limit: 300,
		});
	});

	test('warns from 90 percent up to the limit', () => {
		expect(tightestLimit(countText('a'.repeat(270)), [bluesky])?.state).toBe(
			'warning',
		);
		expect(tightestLimit(countText('a'.repeat(300)), [bluesky])?.state).toBe(
			'warning',
		);
	});

	test('errors above the limit', () => {
		expect(tightestLimit(countText('a'.repeat(301)), [bluesky])).toMatchObject({
			state: 'error',
			unit: 'graphemes',
			actual: 301,
			limit: 300,
		});
	});

	test('errors on the byte cap while graphemes still fit', () => {
		const family = '👨‍👩‍👧‍👦'.repeat(121);
		expect(tightestLimit(countText(family), [bluesky])).toMatchObject({
			state: 'error',
			unit: 'bytes',
			limit: 3000,
		});
	});

	test('names the tightest destination', () => {
		const strict = {
			label: '@strict',
			limits: { maxTextGraphemes: 100, maxTextBytes: 1000 },
		};
		expect(
			tightestLimit(countText('a'.repeat(120)), [bluesky, strict]),
		).toMatchObject({ destination: '@strict', state: 'error' });
	});
});
