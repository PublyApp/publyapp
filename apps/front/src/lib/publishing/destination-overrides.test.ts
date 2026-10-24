import { describe, expect, test } from 'vitest';

import {
	BODY_KEY,
	NO_OVERRIDE,
	effectiveImageCount,
	fromRenditionOverrides,
	isCustomized,
	toWireDestinations,
	toWireOverrides,
	withMedia,
	withText,
	withoutText,
} from './destination-overrides';

const KEYS = [BODY_KEY, 'seg-a', 'seg-b'];
const IMAGES = ['i1', 'i2', 'i3'];

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

	test('image count is the destination subset, else every shared image', () => {
		const subset = withMedia(NO_OVERRIDE, {
			imageKeys: ['i2'],
			altTexts: {},
		});
		const inheritsAll = withMedia(NO_OVERRIDE, {
			imageKeys: null,
			altTexts: {},
		});

		expect(effectiveImageCount(subset, IMAGES)).toBe(1);
		expect(effectiveImageCount(inheritsAll, IMAGES)).toBe(3);
		expect(effectiveImageCount(NO_OVERRIDE, IMAGES)).toBe(3);
		expect(effectiveImageCount(undefined, IMAGES)).toBe(3);
	});

	test('an image removed from the post no longer counts for the destination', () => {
		const stale = withMedia(NO_OVERRIDE, {
			imageKeys: ['i2', 'removed'],
			altTexts: {},
		});

		expect(effectiveImageCount(stale, IMAGES)).toBe(1);
		expect(effectiveImageCount(stale, ['i1', 'i3'])).toBe(0);
	});
});

describe('toWireOverrides', () => {
	test('returns null when the destination inherits everything', () => {
		expect(toWireOverrides(undefined, KEYS, IMAGES)).toBeNull();
		expect(toWireOverrides(NO_OVERRIDE, KEYS, IMAGES)).toBeNull();
	});

	test('sends only the customized segments, by position', () => {
		const override = withText(
			withText(NO_OVERRIDE, 'seg-b', 'third'),
			BODY_KEY,
			'first',
		);

		expect(toWireOverrides(override, KEYS, IMAGES)).toEqual({
			segments: [
				{ position: 0, text: 'first' },
				{ position: 2, text: 'third' },
			],
		});
	});

	test('positions follow the CURRENT segment order, not the order they were customized in', () => {
		const override = withText(NO_OVERRIDE, 'seg-b', 'B');

		expect(
			toWireOverrides(override, [BODY_KEY, 'seg-b', 'seg-a'], IMAGES),
		).toEqual({
			segments: [{ position: 1, text: 'B' }],
		});
	});

	test('drops an override of a segment that no longer exists', () => {
		const override = withText(NO_OVERRIDE, 'seg-removed', 'gone');

		expect(toWireOverrides(override, KEYS, IMAGES)).toBeNull();
	});

	test('sends the media subset in order with alt overrides, mapping local keys to asset ids', () => {
		const override = withMedia(NO_OVERRIDE, {
			imageKeys: ['local-2', 'asset-1'],
			altTexts: { 'local-2': 'A cat' },
		});

		expect(
			toWireOverrides(
				override,
				KEYS,
				['local-2', 'asset-1'],
				new Map([['local-2', 'asset-22']]),
			),
		).toEqual({
			media: {
				assetIds: ['asset-22', 'asset-1'],
				altTexts: [{ assetId: 'asset-22', altText: 'A cat' }],
			},
		});
	});

	test('an override that inherits the images sends no assetIds, so later images still flow', () => {
		const override = withMedia(NO_OVERRIDE, {
			imageKeys: null,
			altTexts: { i1: 'One' },
		});

		const wire = toWireOverrides(override, KEYS, IMAGES);

		expect(wire).toEqual({
			media: { altTexts: [{ assetId: 'i1', altText: 'One' }] },
		});
		expect(wire?.media).not.toHaveProperty('assetIds');
	});

	test('images removed from the post are left out of the subset and the alt texts', () => {
		const override = withMedia(NO_OVERRIDE, {
			imageKeys: ['i2', 'removed', 'i1'],
			altTexts: { removed: 'gone', i1: 'One' },
		});

		expect(toWireOverrides(override, KEYS, ['i1', 'i2'])).toEqual({
			media: {
				assetIds: ['i2', 'i1'],
				altTexts: [{ assetId: 'i1', altText: 'One' }],
			},
		});
	});

	test('a media override with no image left still says so (publish none)', () => {
		const override = withMedia(NO_OVERRIDE, { imageKeys: [], altTexts: {} });

		expect(toWireOverrides(override, KEYS, IMAGES)).toEqual({
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
			imageKeys: IMAGES,
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
			imageKeys: IMAGES,
		});

		expect(destinations).toEqual([{ socialAccountId: 'acc-a' }]);
	});
});

describe('fromRenditionOverrides', () => {
	test('maps stored positions back onto the current segment keys', () => {
		const override = fromRenditionOverrides(
			{ segments: [{ position: 2, text: 'stored' }], media: null },
			KEYS,
		);

		expect(override).toEqual({ texts: { 'seg-b': 'stored' }, media: null });
	});

	test('a media override without assetIds keeps inheriting the post images (null), alt texts only', () => {
		const override = fromRenditionOverrides(
			{
				segments: [],
				media: {
					assetIds: null,
					altTexts: [{ assetId: 'i2', altText: 'Second' }],
				},
			},
			KEYS,
		);

		expect(override.media).toEqual({
			imageKeys: null,
			altTexts: { i2: 'Second' },
		});
	});

	test('a stored override of a segment the post no longer has is dropped', () => {
		const override = fromRenditionOverrides(
			{ segments: [{ position: 9, text: 'orphan' }], media: null },
			KEYS,
		);

		expect(isCustomized(override)).toBe(false);
	});

	test('round-trips through the wire shape, an explicit list or "inherits" alike', () => {
		for (const imageKeys of [['i2', 'i1'], null]) {
			const original = withMedia(withText(NO_OVERRIDE, 'seg-a', 'A'), {
				imageKeys,
				altTexts: { i1: 'One' },
			});
			const wire = toWireOverrides(original, KEYS, IMAGES);

			const back = fromRenditionOverrides(
				{
					segments: wire?.segments ?? [],
					media: wire?.media
						? {
								assetIds: wire.media.assetIds ?? null,
								altTexts: wire.media.altTexts,
							}
						: null,
				},
				KEYS,
			);

			expect(back).toEqual(original);
		}
	});
});
