import { describe, expect, test } from 'vitest';
import {
	BODY_KEY,
	NO_OVERRIDE,
	withMedia,
	withText,
} from '~/lib/publishing/destination-overrides';

import { buildThreadPreview } from './_thread-preview-model';
import type {
	PreviewImage,
	PreviewSegmentInput,
} from './_thread-preview-model';
import type { SelectedDestination } from './_use-publish-selection';

const limits = (max: number, maxImages: number) => ({
	textLimits: [{ unit: 'graphemes', max }],
	maxImages,
	maxImageBytes: 1_000_000,
	acceptedImageContentTypes: ['image/png'],
});

const BIG: SelectedDestination = {
	id: 'big',
	label: 'Big',
	limits: limits(300, 4),
};
const ALSO_BIG: SelectedDestination = {
	id: 'also-big',
	label: 'Also big',
	limits: limits(300, 4),
};
const SMALL: SelectedDestination = {
	id: 'small',
	label: 'Small',
	limits: limits(10, 2),
};

const img = (key: string, altText = ''): PreviewImage => ({
	key,
	url: `https://files.test/${key}.png`,
	file: null,
	altText,
});

const THREAD: PreviewSegmentInput[] = [
	{ key: BODY_KEY, text: 'first', images: [img('r1'), img('r2'), img('r3')] },
	{
		key: 'seg-a',
		text: 'second segment',
		images: [img('a1'), img('a2'), img('a3')],
	},
];

describe('buildThreadPreview', () => {
	test('with no destination selected, the shared thread is the one variant', () => {
		const [only, ...rest] = buildThreadPreview({
			segments: THREAD,
			overrides: {},
			destinations: [],
		});

		expect(rest).toEqual([]);
		expect(only?.destinations).toEqual([]);
		expect(only?.segments.map((segment) => segment.number)).toEqual([1, 2]);
		expect(only?.segments[1]?.images).toHaveLength(3);
	});

	test('destinations that publish the exact same thread are one variant', () => {
		const variants = buildThreadPreview({
			segments: THREAD,
			overrides: {},
			destinations: [BIG, ALSO_BIG],
		});

		expect(variants).toHaveLength(1);
		expect(variants[0]?.destinations).toEqual(['Big', 'Also big']);
	});

	test('it splits where limits differ: the smaller cap keeps fewer images and says how many it drops', () => {
		const variants = buildThreadPreview({
			segments: THREAD,
			overrides: {},
			destinations: [BIG, SMALL],
		});

		expect(variants.map((variant) => variant.destinations)).toEqual([
			['Big'],
			['Small'],
		]);
		const small = variants[1]?.segments;
		expect(small?.[1]?.images.map((image) => image.key)).toEqual(['a1', 'a2']);
		expect(small?.[1]?.droppedImages).toBe(1);
		expect(variants[0]?.segments[1]?.droppedImages).toBe(0);
		// 'second segment' is over the strict 10-grapheme limit.
		expect(small?.[1]?.textState).toBe('error');
	});

	test('a follow-up never publishes more than 4 images, even to a destination that takes 10', () => {
		const roomy: SelectedDestination = { ...BIG, limits: limits(300, 10) };
		const five = THREAD.map((segment) =>
			segment.key === 'seg-a'
				? {
						...segment,
						images: ['a1', 'a2', 'a3', 'a4', 'a5'].map((key) => img(key)),
					}
				: segment,
		);

		const [variant] = buildThreadPreview({
			segments: five,
			overrides: {},
			destinations: [roomy],
		});

		expect(variant?.segments[1]?.images).toHaveLength(4);
		expect(variant?.segments[1]?.droppedImages).toBe(1);
	});

	test('a customized text and a customized first-segment image set show for that destination only', () => {
		const overrides = {
			small: withMedia(withText(NO_OVERRIDE, 'seg-a', 'short'), {
				imageKeys: ['r3'],
				altTexts: { r3: 'custom alt' },
			}),
		};

		const variants = buildThreadPreview({
			segments: THREAD,
			overrides,
			destinations: [BIG, SMALL],
		});

		const small = variants.find(
			(variant) => variant.destinations[0] === 'Small',
		);
		expect(small?.segments[1]?.text).toBe('short');
		expect(small?.segments[0]?.images).toEqual([
			{ ...img('r3'), altText: 'custom alt' },
		]);
		const big = variants.find((variant) => variant.destinations[0] === 'Big');
		expect(big?.segments[1]?.text).toBe('second segment');
		expect(big?.segments[0]?.images).toHaveLength(3);
	});

	test('variants carry the account ids, so two accounts with the same label stay distinct (m3)', () => {
		const twin: SelectedDestination = { ...SMALL, id: 'small-2' };

		const variants = buildThreadPreview({
			segments: THREAD,
			overrides: {},
			destinations: [BIG, SMALL, { ...twin, limits: limits(10, 1) }],
		});

		expect(variants.map((variant) => variant.destinationIds)).toEqual([
			['big'],
			['small'],
			['small-2'],
		]);
	});
});
