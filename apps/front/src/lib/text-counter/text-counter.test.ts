import { describe, expect, test } from 'vitest';

import { countText, tightestLimit, unitCount } from './text-counter';
import fixtures from './text-counter-fixtures.json';

const BLUESKY = {
	textLimits: [
		{ unit: 'graphemes', max: 300 },
		{ unit: 'bytes', max: 3000 },
	],
	maxImages: 4,
	maxImageBytes: 1_000_000,
	acceptedImageContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

describe('countText', () => {
	// The API runs the same file (Publishing/Lib/TextCounter.Spec.cs).
	test.each(fixtures)('$name agrees with the server fixture', (fixture) => {
		expect(countText(fixture.text)).toMatchObject({
			graphemes: fixture.browserGraphemes ?? fixture.graphemes,
			bytes: fixture.bytes,
			utf16: fixture.utf16,
		});
	});

	// Mastodon's URL-weighted unit (#2174): same fixtures as the server.
	test.each(fixtures.filter((fixture) => fixture.characters !== undefined))(
		'$name counts the same Mastodon characters as the server',
		(fixture) => {
			expect(
				unitCount(countText(fixture.text), {
					unit: 'characters',
					max: 500,
					urlWeight: fixture.urlWeight ?? 23,
				}),
			).toBe(fixture.characters);
		},
	);
});

describe('tightestLimit with the unweighted utf16 unit (Pixelfed, Discord)', () => {
	const discord = {
		label: 'Release notes',
		limits: {
			textLimits: [{ unit: 'utf16', max: 2000 }],
			maxImages: 10,
			maxImageBytes: 8_388_608,
			acceptedImageContentTypes: ['image/png'],
		},
	};

	test('counts a URL at its full length', () => {
		const url = `https://example.com/${'a'.repeat(80)}`;
		expect(tightestLimit(countText(url), [discord])).toMatchObject({
			unit: 'utf16',
			actual: url.length,
			limit: 2000,
		});
	});

	test('flags the message over 2000 code units', () => {
		expect(tightestLimit(countText('a'.repeat(2001)), [discord])?.state).toBe(
			'error',
		);
	});
});

describe('tightestLimit with a URL-weighted unit', () => {
	const mastodon = (urlWeight: number) => ({
		label: '@a@mastodon.social',
		limits: {
			textLimits: [{ unit: 'characters', max: 500, urlWeight }],
			maxImages: 4,
			maxImageBytes: 16_777_216,
			acceptedImageContentTypes: ['image/jpeg'],
		},
	});
	const longUrl = `https://example.com/${'a'.repeat(80)}`;

	test('counts a 100-character URL as 23', () => {
		expect(tightestLimit(countText(longUrl), [mastodon(23)])).toMatchObject({
			unit: 'characters',
			actual: 23,
			limit: 500,
		});
	});

	test('follows the instance weight', () => {
		expect(tightestLimit(countText(longUrl), [mastodon(30)])).toMatchObject({
			actual: 30,
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
			limits: {
				textLimits: [
					{ unit: 'graphemes', max: 100 },
					{ unit: 'bytes', max: 1000 },
				],
				maxImages: 4,
				maxImageBytes: 1_000_000,
				acceptedImageContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
			},
		};
		expect(
			tightestLimit(countText('a'.repeat(120)), [bluesky, strict]),
		).toMatchObject({ destination: '@strict', state: 'error' });
	});
});
