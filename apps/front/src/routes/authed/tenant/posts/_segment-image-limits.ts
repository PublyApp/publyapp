import type { ImageLimits } from './_use-publish-selection';

/** A follow-up segment carries 0-4 images (the server refuses a fifth). */
export const MAX_SEGMENT_IMAGES = 4;

/** The caps of a follow-up segment: the destinations' caps, never above what
 * a follow-up may hold. */
export const segmentImageLimits = (
	limits: ImageLimits | null,
): ImageLimits | null =>
	limits && {
		...limits,
		maxImages: Math.min(limits.maxImages, MAX_SEGMENT_IMAGES),
	};

/** How many images one destination takes on a follow-up segment. */
export const segmentMaxImages = (destinationMaxImages: number): number =>
	Math.min(destinationMaxImages, MAX_SEGMENT_IMAGES);
