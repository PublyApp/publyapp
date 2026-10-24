import { describe, expect, test } from 'vitest';

import {
	BODY_KEY,
	NO_OVERRIDE,
	effectiveImageCount,
	effectiveText,
	fromRenditionOverrides,
	isCustomized,
	toWireDestinations,
	toWireOverrides,
	withMedia,
	withText,
	withoutText,
} from './destination-overrides';

const KEYS = [BODY_KEY, 'seg-a', 'seg-b'];

describe('destination overrides model', () => {
	test('nothing overridden is not customized', () => {
		expect(isCustomized(undefined)).toBe(false);
		expect(isCustomized(NO_OVERRIDE)).toBe(false);
		expect(isCustomized(withText(NO_OVERRIDE, BODY_KEY, 'x'))).toBe(true);
		expect(
			isCustomized(withMedia(NO_OVERRIDE, { imageKeys: [], altTexts: {} })),
		).toBe(true);
	});

	test('withText / withoutText never mutate and drop only the named key', () => {
		const one = withText(NO_OVERRIDE, BODY_KEY, 'B');
		const two = withText(one, 'seg-a', 'A');

		expect(NO_OVERRIDE.texts).toEqual({});
		expect(one.texts).toEqual({ [BODY_KEY]: 'B' });
		expect(withoutText(two, BODY_KEY).texts).toEqual({ 'seg-a': 'A' });
	});

	test('a destination publishes its own text, else the shared one', () => {
		const override = withText(NO_OVERRIDE, BODY_KEY, 'own');

		expect(effectiveText(override, BODY_KEY, 'shared')).toBe('own');
		expect(effectiveText(override, 'seg-a', 'shared a')).toBe('shared a');
		expect(effectiveText(undefined, BODY_KEY, 'shared')).toBe('shared');
	});

	test('image count is the destination subset, else every shared image', () => {
		const subset = withMedia(NO_OVERRIDE, {
			imageKeys: ['i2'],
			altTexts: {},
		});

		expect(effectiveImageCount(subset, 3)).toBe(1);
		expect(effectiveImageCount(NO_OVERRIDE, 3)).toBe(3);
		expect(effectiveImageCount(undefined, 3)).toBe(3);
	});
});

describe('toWireOverrides', () => {
	test('returns null when the destination inherits everything', () => {
		expect(toWireOverrides(undefined, KEYS)).toBeNull();
		expect(toWireOverrides(NO_OVERRIDE, KEYS)).toBeNull();
	});

	test('sends only the customized segments, by position', () => {
		const override = withText(
			withText(NO_OVERRIDE, 'seg-b', 'third'),
			BODY_KEY,
			'first',
		);

		expect(toWireOverrides(override, KEYS)).toEqual({
			segments: [
				{ position: 0, text: 'first' },
				{ position: 2, text: 'third' },
			],
		});
	});

	test('positions follow the CURRENT segment order, not the order they were customized in', () => {
		const override = withText(NO_OVERRIDE, 'seg-b', 'B');

		expect(toWireOverrides(override, [BODY_KEY, 'seg-b', 'seg-a'])).toEqual({
			segments: [{ position: 1, text: 'B' }],
		});
	});

	test('drops an override of a segment that no longer exists', () => {
		const override = withText(NO_OVERRIDE, 'seg-removed', 'gone');

		expect(toWireOverrides(override, KEYS)).toBeNull();
	});

	test('sends the media subset in order with alt overrides, mapping local keys to asset ids', () => {
		const override = withMedia(NO_OVERRIDE, {
			imageKeys: ['local-2', 'asset-1'],
			altTexts: { 'local-2': 'A cat' },
		});

		expect(
			toWireOverrides(override, KEYS, new Map([['local-2', 'asset-22']])),
		).toEqual({
			media: {
				assetIds: ['asset-22', 'asset-1'],
				altTexts: [{ assetId: 'asset-22', altText: 'A cat' }],
			},
		});
	});

	test('a media override with no image left still says so (publish none)', () => {
		const override = withMedia(NO_OVERRIDE, { imageKeys: [], altTexts: {} });

		expect(toWireOverrides(override, KEYS)).toEqual({
			media: { assetIds: [], altTexts: [] },
		});
	});
});

describe('toWireDestinations', () => {
	test('lists every selected account and puts overrides only on the customized one', () => {
		const destinations = toWireDestinations({
			accountIds: ['acc-a', 'acc-b'],
			overrides: { 'acc-b': withText(NO_OVERRIDE, BODY_KEY, 'for B') },
			segmentKeys: KEYS,
		});

		expect(destinations).toEqual([
			{ socialAccountId: 'acc-a' },
			{
				socialAccountId: 'acc-b',
				overrides: { segments: [{ position: 0, text: 'for B' }] },
			},
		]);
	});

	test('never sends overrides of a destination that is not selected', () => {
		const destinations = toWireDestinations({
			accountIds: ['acc-a'],
			overrides: { 'acc-b': withText(NO_OVERRIDE, BODY_KEY, 'for B') },
			segmentKeys: KEYS,
		});

		expect(destinations).toEqual([{ socialAccountId: 'acc-a' }]);
	});
});

describe('fromRenditionOverrides', () => {
	test('maps stored positions back onto the current segment keys', () => {
		const override = fromRenditionOverrides(
			{ segments: [{ position: 2, text: 'stored' }], media: null },
			KEYS,
			['i1'],
		);

		expect(override).toEqual({ texts: { 'seg-b': 'stored' }, media: null });
	});

	test('a media override without assetIds keeps every image of the post, in order', () => {
		const override = fromRenditionOverrides(
			{
				segments: [],
				media: {
					assetIds: null,
					altTexts: [{ assetId: 'i2', altText: 'Second' }],
				},
			},
			KEYS,
			['i1', 'i2'],
		);

		expect(override.media).toEqual({
			imageKeys: ['i1', 'i2'],
			altTexts: { i2: 'Second' },
		});
	});

	test('a stored override of a segment the post no longer has is dropped', () => {
		const override = fromRenditionOverrides(
			{ segments: [{ position: 9, text: 'orphan' }], media: null },
			KEYS,
			[],
		);

		expect(isCustomized(override)).toBe(false);
	});

	test('round-trips through the wire shape', () => {
		const original = withMedia(withText(NO_OVERRIDE, 'seg-a', 'A'), {
			imageKeys: ['i2', 'i1'],
			altTexts: { i1: 'One' },
		});
		const wire = toWireOverrides(original, KEYS);

		const back = fromRenditionOverrides(
			{
				segments: wire?.segments ?? [],
				media: wire?.media ?? null,
			},
			KEYS,
			['i1', 'i2'],
		);

		expect(back).toEqual(original);
	});
});
