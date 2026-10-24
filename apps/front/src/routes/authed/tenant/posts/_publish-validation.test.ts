import { describe, expect, test } from 'vitest';
import {
	BODY_KEY,
	NO_OVERRIDE,
	withMedia,
	withText,
} from '~/lib/publishing/destination-overrides';

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
