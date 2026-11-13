import {
	BODY_KEY,
	effectiveImageCount,
} from '~/lib/publishing/destination-overrides';
import type { DestinationOverrides } from '~/lib/publishing/destination-overrides';
import { countText, tightestLimit } from '~/lib/text-counter/text-counter';
import type { TightestLimit } from '~/lib/text-counter/text-counter';

import type { SegmentDraft } from './_segment-draft';
import { segmentMaxImages } from './_segment-image-limits';
import type { SelectedDestination } from './_use-publish-selection';

const NO_SEGMENT_IMAGE_COUNTS: Readonly<Record<string, number>> = {};
const NO_IMAGE_SIZES: readonly number[] = [];

/** The server refuses a publish-now request above this many destinations. */
export const PUBLISH_NOW_MAX_DESTINATIONS = 20;

type DestinationBlock = {
	key:
		| 'posts:publish-blocked-media-required'
		| 'posts:publish-blocked-threads-unsupported'
		| 'posts:publish-blocked-too-many-images'
		| 'posts:publish-blocked-image-too-large';
	destination: string;
	/** The post's image count, for the too-many-images block. */
	count?: number;
	/** The destination's cap: images for too-many-images, bytes for too-large. */
	max?: number;
};

/** The first selected destination that cannot take this post as it will be
 * published to it: a photo network with no image, or a thread aimed at a
 * network without threads (the server refuses both, this says so before the
 * click). A destination that customizes its images is judged on its own set. */
const findDestinationBlock = (
	destinations: readonly SelectedDestination[],
	overrides: DestinationOverrides,
	imageKeys: readonly string[],
	followUpCount: number,
	imageSizes: readonly number[],
): DestinationBlock | null => {
	for (const { id, label, limits } of destinations) {
		const count = effectiveImageCount(overrides[id], imageKeys);
		if (count > limits.maxImages) {
			return {
				key: 'posts:publish-blocked-too-many-images',
				destination: label,
				count,
				max: limits.maxImages,
			};
		}
		// A destination that customizes its images is judged on its own set, whose
		// sizes are not known here; the others take every picked file.
		if (
			overrides[id]?.media?.imageKeys == null &&
			imageSizes.some((size) => size > limits.maxImageBytes)
		) {
			return {
				key: 'posts:publish-blocked-image-too-large',
				destination: label,
				max: limits.maxImageBytes,
			};
		}
		if (
			limits.requiresMedia === true &&
			effectiveImageCount(overrides[id], imageKeys) === 0
		) {
			return {
				key: 'posts:publish-blocked-media-required',
				destination: label,
			};
		}
		if (limits.supportsThreads === false && followUpCount > 0) {
			return {
				key: 'posts:publish-blocked-threads-unsupported',
				destination: label,
			};
		}
	}
	return null;
};

type SegmentImageProblem = {
	destination: string;
	/** 1-based segment number. */
	segmentNumber: number;
	count: number;
	max: number;
};

/** The first follow-up holding more images than a SELECTED destination takes
 * on a segment (its own cap, never above 4): the server refuses it at
 * dispatch, so the Publish button says so first. */
const findSegmentImageProblem = (
	destinations: readonly SelectedDestination[],
	segments: readonly SegmentDraft[],
	segmentImageCounts: Readonly<Record<string, number>>,
): SegmentImageProblem | null => {
	for (const { label, limits } of destinations) {
		const max = segmentMaxImages(limits.maxImages);
		for (const [position, segment] of segments.entries()) {
			const count = segmentImageCounts[segment.id] ?? 0;
			if (count > max) {
				return { destination: label, segmentNumber: position + 2, count, max };
			}
		}
	}
	return null;
};

type OverrideProblem = {
	kind: 'blank' | 'over-limit';
	destination: string;
	/** 1-based segment number. */
	segmentNumber: number;
};

/** The first customized text that cannot be published to its own destination:
 * blank (the server refuses it: reset to inherit instead) or over that
 * destination's limits. */
const findOverrideProblem = (
	destinations: readonly SelectedDestination[],
	overrides: DestinationOverrides,
	segmentKeys: readonly string[],
): OverrideProblem | null => {
	for (const destination of destinations) {
		const override = overrides[destination.id];
		for (const [position, key] of segmentKeys.entries()) {
			const text = override?.texts[key];
			if (text === undefined) {
				continue;
			}

			const problem = {
				destination: destination.label,
				segmentNumber: position + 1,
			};
			if (text.trim() === '') {
				return { kind: 'blank', ...problem };
			}
			if (tightestLimit(countText(text), [destination])?.state === 'error') {
				return { kind: 'over-limit', ...problem };
			}
		}
	}
	return null;
};

/** The destinations that publish a segment's SHARED text, i.e. did not
 * customize it: the shared tab validates against exactly these. */
export const inheritingDestinations = (
	destinations: readonly SelectedDestination[],
	overrides: DestinationOverrides,
	segmentKey: string,
): SelectedDestination[] =>
	destinations.filter(
		(destination) => overrides[destination.id]?.texts[segmentKey] === undefined,
	);

export type PublishProblems = {
	/** The body's tightest limit across the destinations that inherit it. */
	bodyLimit: TightestLimit | null;
	/** The first shared follow-up (0-based) over the limit of a destination
	 * that inherits it, or -1. */
	overLimitFollowUp: number;
	overrideProblem: OverrideProblem | null;
	/** A follow-up with more images than a selected destination takes. */
	segmentImageProblem: SegmentImageProblem | null;
	destinationBlock: DestinationBlock | null;
};

/** Everything that stops a publish or schedule, judged per destination: the
 * shared text against the destinations that inherit it, each customized text
 * against its own destination. */
export const findPublishProblems = ({
	destinations,
	overrides,
	body,
	segments,
	imageKeys,
	segmentImageCounts = NO_SEGMENT_IMAGE_COUNTS,
	imageSizes = NO_IMAGE_SIZES,
}: {
	destinations: readonly SelectedDestination[];
	overrides: DestinationOverrides;
	body: string;
	segments: readonly SegmentDraft[];
	/** The post's images (keys): a destination's image override is judged
	 * against the images that are still on the post. */
	imageKeys: readonly string[];
	/** How many images each follow-up holds, by segment id. */
	segmentImageCounts?: Readonly<Record<string, number>>;
	/** Byte size of every picked, not yet uploaded image (the post's and the
	 * follow-ups'): held against each destination's size cap. */
	imageSizes?: readonly number[];
}): PublishProblems => {
	const segmentKeys = [BODY_KEY, ...segments.map((segment) => segment.id)];

	return {
		bodyLimit: tightestLimit(
			countText(body),
			inheritingDestinations(destinations, overrides, BODY_KEY),
		),
		overLimitFollowUp: segments.findIndex(
			(segment) =>
				tightestLimit(
					countText(segment.text),
					inheritingDestinations(destinations, overrides, segment.id),
				)?.state === 'error',
		),
		overrideProblem: findOverrideProblem(destinations, overrides, segmentKeys),
		segmentImageProblem: findSegmentImageProblem(
			destinations,
			segments,
			segmentImageCounts,
		),
		destinationBlock: findDestinationBlock(
			destinations,
			overrides,
			imageKeys,
			segments.length,
			imageSizes,
		),
	};
};

export const isPublishBlocked = (problems: PublishProblems): boolean =>
	problems.bodyLimit?.state === 'error' ||
	problems.overLimitFollowUp >= 0 ||
	problems.overrideProblem !== null ||
	problems.segmentImageProblem !== null ||
	problems.destinationBlock !== null;
