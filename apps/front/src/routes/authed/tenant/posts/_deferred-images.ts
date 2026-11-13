import type { DeferredImageSelection } from './_post-image-picker';

/** The create drawer holds every picked image in ONE list: the post's own
 * images carry no `segmentKey`, a follow-up's carry the composer key of that
 * segment (#2181). Each picker works on its own slice, so a pick, a reorder
 * or a removal in one never touches another's. */

/** The post's own images, in picked order. */
export const postImages = (
	all: readonly DeferredImageSelection[],
): DeferredImageSelection[] =>
	all.filter((image) => image.segmentKey === undefined);

/** One follow-up segment's images, in picked order. */
export const imagesOfSegment = (
	all: readonly DeferredImageSelection[],
	segmentKey: string,
): DeferredImageSelection[] =>
	all.filter((image) => image.segmentKey === segmentKey);

/** The list with the post's own images replaced by `next`. */
export const withPostImages = (
	all: readonly DeferredImageSelection[],
	next: readonly DeferredImageSelection[],
): DeferredImageSelection[] => [
	...next.map((image) => ({ ...image, segmentKey: undefined })),
	...all.filter((image) => image.segmentKey !== undefined),
];

/** The list with one segment's images replaced by `next` (stamped with the
 * segment, whatever the picker handed back). */
export const withSegmentImages = (
	all: readonly DeferredImageSelection[],
	segmentKey: string,
	next: readonly DeferredImageSelection[],
): DeferredImageSelection[] => [
	...all.filter((image) => image.segmentKey !== segmentKey),
	...next.map((image) => ({ ...image, segmentKey })),
];

/** Only the images of segments the composer still has: a removed segment
 * takes its images with it (the server drops them with the segment). */
export const imagesOfLiveSegments = (
	all: readonly DeferredImageSelection[],
	liveSegmentKeys: readonly string[],
): DeferredImageSelection[] => {
	const live = new Set(liveSegmentKeys);
	return all.filter(
		(image) => image.segmentKey === undefined || live.has(image.segmentKey),
	);
};

/** How many images each follow-up segment holds, by composer key. */
export const countBySegment = (all: readonly DeferredImageSelection[]) => {
	const counts = new Map<string, number>();
	for (const { segmentKey } of all) {
		if (segmentKey !== undefined) {
			counts.set(segmentKey, (counts.get(segmentKey) ?? 0) + 1);
		}
	}
	return Object.fromEntries(counts);
};
