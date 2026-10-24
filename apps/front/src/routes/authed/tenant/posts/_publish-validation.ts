import {
	BODY_KEY,
	effectiveImageCount,
} from '~/lib/publishing/destination-overrides';
import type { DestinationOverrides } from '~/lib/publishing/destination-overrides';
import { countText, tightestLimit } from '~/lib/text-counter/text-counter';
import type { TightestLimit } from '~/lib/text-counter/text-counter';

import type { SegmentDraft } from './_segment-draft';
import type { SelectedDestination } from './_use-publish-selection';

/** The server refuses a publish-now request above this many destinations. */
export const PUBLISH_NOW_MAX_DESTINATIONS = 20;

type DestinationBlock = {
	key:
		| 'posts:publish-blocked-media-required'
		| 'posts:publish-blocked-threads-unsupported';
	destination: string;
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
): DestinationBlock | null => {
	for (const { id, label, limits } of destinations) {
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
}: {
	destinations: readonly SelectedDestination[];
	overrides: DestinationOverrides;
	body: string;
	segments: readonly SegmentDraft[];
	/** The post's images (keys): a destination's image override is judged
	 * against the images that are still on the post. */
	imageKeys: readonly string[];
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
		destinationBlock: findDestinationBlock(
			destinations,
			overrides,
			imageKeys,
			segments.length,
		),
	};
};

export const isPublishBlocked = (problems: PublishProblems): boolean =>
	problems.bodyLimit?.state === 'error' ||
	problems.overLimitFollowUp >= 0 ||
	problems.overrideProblem !== null ||
	problems.destinationBlock !== null;
