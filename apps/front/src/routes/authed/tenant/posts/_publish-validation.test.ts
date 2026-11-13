import { describe, expect, test } from 'vitest';
import {
	BODY_KEY,
	NO_OVERRIDE,
	withMedia,
	withText,
} from '~/lib/publishing/destination-overrides';

import { imageSizesOf, imagesOfLiveSegments } from './_deferred-images';
import {
	findPublishProblems,
	inheritingDestinations,
	isPublishBlocked,
} from './_publish-validation';
import type { SegmentDraft } from './_segment-draft';
import type { SelectedDestination } from './_use-publish-selection';

const limits = (max: number, extra = {}) => ({
	textLimits: [{ unit: 'graphemes', max }],
	maxImages: 4,
	maxImageBytes: 1_000_000,
	acceptedImageContentTypes: ['image/png'],
	...extra,
});

const ROOMY: SelectedDestination = {
	id: 'acc-roomy',
	label: 'Roomy',
	limits: limits(300),
};
const STRICT: SelectedDestination = {
	id: 'acc-strict',
	label: 'Strict',
	limits: limits(10),
};
const PHOTOS: SelectedDestination = {
	id: 'acc-photos',
	label: 'Photos',
	limits: limits(500, { requiresMedia: true, supportsThreads: false }),
};

const NO_SEGMENTS: SegmentDraft[] = [];

const problemsOf = (
	args: Partial<Parameters<typeof findPublishProblems>[0]> & {
		destinations: SelectedDestination[];
	},
) =>
	findPublishProblems({
		overrides: {},
		body: 'hello',
		segments: NO_SEGMENTS,
		imageKeys: [],
		...args,
	});

describe('inheritingDestinations', () => {
	test('leaves out the destinations that customized that segment only', () => {
		const overrides = {
			[STRICT.id]: withText(NO_OVERRIDE, BODY_KEY, 'mine'),
		};

		expect(
			inheritingDestinations([ROOMY, STRICT], overrides, BODY_KEY),
		).toEqual([ROOMY]);
		expect(inheritingDestinations([ROOMY, STRICT], overrides, 'seg-1')).toEqual(
			[ROOMY, STRICT],
		);
	});
});

describe('findPublishProblems', () => {
	test('the shared body is judged by every destination that inherits it', () => {
		const problems = problemsOf({
			destinations: [ROOMY, STRICT],
			body: 'x'.repeat(40),
		});

		expect(problems.bodyLimit?.state).toBe('error');
		expect(problems.bodyLimit?.destination).toBe('Strict');
		expect(isPublishBlocked(problems)).toBe(true);
	});

	test('a destination that customized the body no longer judges the shared one', () => {
		const problems = problemsOf({
			destinations: [ROOMY, STRICT],
			body: 'x'.repeat(40),
			overrides: { [STRICT.id]: withText(NO_OVERRIDE, BODY_KEY, 'short') },
		});

		expect(problems.bodyLimit?.state).toBe('ok');
		expect(problems.bodyLimit?.destination).toBe('Roomy');
		expect(isPublishBlocked(problems)).toBe(false);
	});

	test('a customized text is judged by its own destination only', () => {
		const long = 'y'.repeat(40);
		// 40 characters fit the roomy destination, not the strict one.
		expect(
			problemsOf({
				destinations: [ROOMY, STRICT],
				overrides: { [ROOMY.id]: withText(NO_OVERRIDE, BODY_KEY, long) },
			}).overrideProblem,
		).toBeNull();
		expect(
			problemsOf({
				destinations: [ROOMY, STRICT],
				overrides: { [STRICT.id]: withText(NO_OVERRIDE, BODY_KEY, long) },
			}).overrideProblem,
		).toEqual({ kind: 'over-limit', destination: 'Strict', segmentNumber: 1 });
	});

	test('a blank customized text is its own problem', () => {
		expect(
			problemsOf({
				destinations: [ROOMY],
				overrides: { [ROOMY.id]: withText(NO_OVERRIDE, BODY_KEY, '  ') },
			}).overrideProblem,
		).toEqual({ kind: 'blank', destination: 'Roomy', segmentNumber: 1 });
	});

	test('names the 1-based number of the segment that is customized too long', () => {
		const segments: SegmentDraft[] = [
			{ id: 'seg-1', text: 'ok' },
			{ id: 'seg-2', text: 'ok' },
		];

		expect(
			problemsOf({
				destinations: [STRICT],
				segments,
				overrides: {
					[STRICT.id]: withText(NO_OVERRIDE, 'seg-2', 'z'.repeat(40)),
				},
			}).overrideProblem,
		).toEqual({ kind: 'over-limit', destination: 'Strict', segmentNumber: 3 });
	});

	test('the first over-long shared follow-up is reported, skipping destinations that customized it', () => {
		const segments: SegmentDraft[] = [
			{ id: 'seg-1', text: 'fine' },
			{ id: 'seg-2', text: 'w'.repeat(40) },
		];

		expect(
			problemsOf({ destinations: [STRICT], segments }).overLimitFollowUp,
		).toBe(1);
		expect(
			problemsOf({
				destinations: [STRICT],
				segments,
				overrides: { [STRICT.id]: withText(NO_OVERRIDE, 'seg-2', 'short') },
			}).overLimitFollowUp,
		).toBe(-1);
	});

	test('a photo network needs an image of ITS OWN set, and no thread', () => {
		expect(problemsOf({ destinations: [PHOTOS] }).destinationBlock?.key).toBe(
			'posts:publish-blocked-media-required',
		);
		expect(
			problemsOf({ destinations: [PHOTOS], imageKeys: ['i1', 'i2'] })
				.destinationBlock,
		).toBeNull();
		expect(
			problemsOf({
				destinations: [PHOTOS],
				imageKeys: ['i1', 'i2'],
				overrides: {
					[PHOTOS.id]: withMedia(NO_OVERRIDE, { imageKeys: [], altTexts: {} }),
				},
			}).destinationBlock?.key,
		).toBe('posts:publish-blocked-media-required');
		expect(
			problemsOf({
				destinations: [PHOTOS],
				imageKeys: ['i1'],
				segments: [{ id: 'seg-1', text: 'more' }],
			}).destinationBlock?.key,
		).toBe('posts:publish-blocked-threads-unsupported');
	});

	test('a destination whose image subset names only removed images is judged as having none', () => {
		const problems = problemsOf({
			destinations: [PHOTOS],
			imageKeys: ['i1'],
			overrides: {
				[PHOTOS.id]: withMedia(NO_OVERRIDE, {
					imageKeys: ['removed'],
					altTexts: {},
				}),
			},
		});

		expect(problems.destinationBlock?.key).toBe(
			'posts:publish-blocked-media-required',
		);
	});

	test('nothing selected means nothing to validate', () => {
		const problems = problemsOf({ destinations: [] });

		expect(problems.bodyLimit).toBeNull();
		expect(isPublishBlocked(problems)).toBe(false);
	});
});

describe('per-segment image counts (#2181)', () => {
	const FOLLOW_UPS: SegmentDraft[] = [
		{ id: 'seg-a', text: 'two' },
		{ id: 'seg-b', text: 'three' },
	];
	const TWO_AT_MOST: SelectedDestination = {
		id: 'acc-two',
		label: 'Two',
		limits: limits(300, { maxImages: 2 }),
	};

	test('a follow-up within every selected destination cap is fine', () => {
		const problems = problemsOf({
			destinations: [ROOMY, TWO_AT_MOST],
			segments: FOLLOW_UPS,
			segmentImageCounts: { 'seg-a': 2, 'seg-b': 0 },
		});

		expect(problems.segmentImageProblem).toBeNull();
		expect(isPublishBlocked(problems)).toBe(false);
	});

	test('names the destination, the segment number and both counts when a follow-up has too many', () => {
		const problems = problemsOf({
			destinations: [ROOMY, TWO_AT_MOST],
			segments: FOLLOW_UPS,
			segmentImageCounts: { 'seg-a': 1, 'seg-b': 3 },
		});

		expect(problems.segmentImageProblem).toEqual({
			destination: 'Two',
			segmentNumber: 3,
			count: 3,
			max: 2,
		});
		expect(isPublishBlocked(problems)).toBe(true);
	});

	test('only SELECTED destinations count: the strict one deselected, the same thread passes', () => {
		const counts = { 'seg-a': 3 };

		expect(
			problemsOf({
				destinations: [ROOMY],
				segments: FOLLOW_UPS,
				segmentImageCounts: counts,
			}).segmentImageProblem,
		).toBeNull();
		expect(
			problemsOf({
				destinations: [ROOMY, TWO_AT_MOST],
				segments: FOLLOW_UPS,
				segmentImageCounts: counts,
			}).segmentImageProblem?.destination,
		).toBe('Two');
	});

	test('a follow-up never takes more than 4 images, whatever the destination advertises', () => {
		const roomyImages: SelectedDestination = {
			id: 'acc-ten',
			label: 'Ten',
			limits: limits(300, { maxImages: 10 }),
		};

		const problems = problemsOf({
			destinations: [roomyImages],
			segments: FOLLOW_UPS,
			segmentImageCounts: { 'seg-b': 5 },
		});

		expect(problems.segmentImageProblem?.max).toBe(4);
		expect(isPublishBlocked(problems)).toBe(true);
	});

	test('the post own images are judged separately: segment counts do not touch them', () => {
		const problems = problemsOf({
			destinations: [PHOTOS],
			imageKeys: ['one'],
			segmentImageCounts: {},
		});

		expect(problems.segmentImageProblem).toBeNull();
	});
});

describe('picked image size and count (#2421)', () => {
	const TIGHT: SelectedDestination = {
		id: 'acc-tight',
		label: 'Tight',
		limits: limits(300, { maxImages: 2, maxImageBytes: 500_000 }),
	};

	test('a stricter destination blocks too many images; deselecting it clears it', () => {
		const imageKeys = ['i1', 'i2', 'i3'];

		const blocked = problemsOf({ destinations: [ROOMY, TIGHT], imageKeys });
		expect(blocked.destinationBlock).toMatchObject({
			key: 'posts:publish-blocked-too-many-images',
			destination: 'Tight',
			count: 3,
			max: 2,
		});
		expect(isPublishBlocked(blocked)).toBe(true);

		const cleared = problemsOf({ destinations: [ROOMY], imageKeys });
		expect(cleared.destinationBlock).toBeNull();
		expect(isPublishBlocked(cleared)).toBe(false);
	});

	test('a picked file above a destination size cap blocks; deselecting it clears it', () => {
		const imageSizes = [
			{ id: 'i1', size: 10 },
			{ id: 'i2', size: 600_000 },
		];

		const blocked = problemsOf({
			destinations: [ROOMY, TIGHT],
			imageKeys: ['i1', 'i2'],
			imageSizes,
		});
		expect(blocked.destinationBlock).toMatchObject({
			key: 'posts:publish-blocked-image-too-large',
			destination: 'Tight',
			max: 500_000,
		});

		expect(
			problemsOf({
				destinations: [ROOMY],
				imageKeys: ['i1', 'i2'],
				imageSizes,
			}).destinationBlock,
		).toBeNull();
	});

	test('a destination that customizes its images is judged on ITS OWN set', () => {
		const imageSizes = [
			{ id: 'i1', size: 10 },
			{ id: 'i2', size: 600_000 },
		];
		const customized = (keys: string[]) => ({
			[TIGHT.id]: withMedia(NO_OVERRIDE, { imageKeys: keys, altTexts: {} }),
		});

		// Its set keeps only the small image: fine.
		expect(
			problemsOf({
				destinations: [TIGHT],
				imageKeys: ['i1', 'i2'],
				imageSizes,
				overrides: customized(['i1']),
			}).destinationBlock,
		).toBeNull();
		// Its set keeps the large one: blocked, as the card says.
		expect(
			problemsOf({
				destinations: [TIGHT],
				imageKeys: ['i1', 'i2'],
				imageSizes,
				overrides: customized(['i2']),
			}).destinationBlock?.key,
		).toBe('posts:publish-blocked-image-too-large');
	});

	test('a follow-up image is never part of a customization: it is always checked', () => {
		expect(
			problemsOf({
				destinations: [TIGHT],
				imageKeys: ['i1'],
				imageSizes: [
					{ id: 'i1', size: 10 },
					{ id: 'follow-up-image', size: 600_000 },
				],
				overrides: {
					[TIGHT.id]: withMedia(NO_OVERRIDE, {
						imageKeys: ['i1'],
						altTexts: {},
					}),
				},
			}).destinationBlock?.key,
		).toBe('posts:publish-blocked-image-too-large');
	});

	test('removing a follow-up takes its large file out of the check, so the block clears', () => {
		const file = (name: string, bytes: number) =>
			new File([new Uint8Array(bytes)], name, { type: 'image/png' });
		const queued = [
			{ id: 'post-image', file: file('a.png', 10), altText: '' },
			{
				id: 'follow-image',
				file: file('b.png', 600_000),
				altText: '',
				segmentKey: 'seg-1',
			},
		];
		const check = (liveSegmentKeys: string[]) =>
			problemsOf({
				destinations: [TIGHT],
				imageKeys: ['post-image'],
				imageSizes: imageSizesOf(imagesOfLiveSegments(queued, liveSegmentKeys)),
			}).destinationBlock;

		expect(check(['seg-1'])?.key).toBe('posts:publish-blocked-image-too-large');
		// The follow-up was removed from the composer: nothing left to remove.
		expect(check([])).toBeNull();
	});

	test('no picked images (edit page) means no size check', () => {
		expect(
			problemsOf({ destinations: [TIGHT], imageKeys: ['i1'] }).destinationBlock,
		).toBeNull();
	});
});
