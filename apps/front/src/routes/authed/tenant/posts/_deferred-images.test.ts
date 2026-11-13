import { describe, expect, test } from 'vitest';

import {
	countBySegment,
	imagesOfLiveSegments,
	imagesOfSegment,
	postImages,
	withPostImages,
	withSegmentImages,
} from './_deferred-images';
import type { DeferredImageSelection } from './_post-image-picker';

const image = (id: string, segmentKey?: string): DeferredImageSelection => ({
	id,
	file: new File(['x'], `${id}.png`, { type: 'image/png' }),
	altText: '',
	segmentKey,
});

const ALL = [
	image('root-1'),
	image('a-1', 'seg-a'),
	image('root-2'),
	image('a-2', 'seg-a'),
	image('b-1', 'seg-b'),
];

const ids = (list: readonly DeferredImageSelection[]) =>
	list.map((entry) => entry.id);

describe('deferred image slices', () => {
	test('each picker sees only its own images, in picked order', () => {
		expect(ids(postImages(ALL))).toEqual(['root-1', 'root-2']);
		expect(ids(imagesOfSegment(ALL, 'seg-a'))).toEqual(['a-1', 'a-2']);
		expect(ids(imagesOfSegment(ALL, 'seg-b'))).toEqual(['b-1']);
		expect(imagesOfSegment(ALL, 'seg-none')).toEqual([]);
	});

	test('replacing one slice leaves every other slice untouched', () => {
		const next = withSegmentImages(ALL, 'seg-a', [image('a-2')]);

		expect(ids(postImages(next))).toEqual(['root-1', 'root-2']);
		expect(ids(imagesOfSegment(next, 'seg-a'))).toEqual(['a-2']);
		expect(ids(imagesOfSegment(next, 'seg-b'))).toEqual(['b-1']);
	});

	test('what a segment picker hands back is stamped with its segment', () => {
		const next = withSegmentImages([], 'seg-c', [image('new')]);

		expect(next[0]?.segmentKey).toBe('seg-c');
	});

	test('the post own picker never carries a segment key', () => {
		const next = withPostImages(ALL, [image('root-9', 'seg-a')]);

		expect(postImages(next).map((entry) => entry.id)).toEqual(['root-9']);
		expect(ids(imagesOfSegment(next, 'seg-a'))).toEqual(['a-1', 'a-2']);
	});

	test('a removed segment takes its images with it', () => {
		expect(ids(imagesOfLiveSegments(ALL, ['seg-b']))).toEqual([
			'root-1',
			'root-2',
			'b-1',
		]);
	});

	test('counts per segment, the post own images left out', () => {
		expect(countBySegment(ALL)).toEqual({ 'seg-a': 2, 'seg-b': 1 });
	});
});
