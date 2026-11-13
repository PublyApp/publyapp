import { BODY_KEY } from '~/lib/publishing/destination-overrides';
import type { DestinationOverrides } from '~/lib/publishing/destination-overrides';
import { countText, tightestLimit } from '~/lib/text-counter/text-counter';

import { segmentMaxImages } from './_segment-image-limits';
import type { SelectedDestination } from './_use-publish-selection';

/** An image of the thread as the preview shows it: a stored one has a url, a
 * picked one (not uploaded yet) its file. */
export type PreviewImage = {
	/** The asset id once stored, the local id before. */
	key: string;
	url: string | null;
	file: File | null;
	/** The shared alt text. */
	altText: string;
};

/** One segment of the shared thread: the composer key (BODY_KEY for the
 * first), its text and its images in order. */
export type PreviewSegmentInput = {
	key: string;
	text: string;
	images: readonly PreviewImage[];
};

export type PreviewSegment = {
	/** 1-based place in the thread. */
	number: number;
	text: string;
	/** 'error' when the text is over the destination's limit. */
	textState: 'ok' | 'warning' | 'error';
	/** The images this destination publishes, in order, with its alt text. */
	images: PreviewImage[];
	/** Images beyond the destination's cap: left out when it publishes. */
	droppedImages: number;
};

/** The thread as it publishes to one or several destinations that get the
 * exact same result. */
export type PreviewVariant = {
	/** Labels of the destinations; empty when none is selected yet. */
	destinations: string[];
	/** Their account ids (what the variant is keyed by). */
	destinationIds: string[];
	segments: PreviewSegment[];
};

const previewFor = (
	input: readonly PreviewSegmentInput[],
	overrides: DestinationOverrides,
	destination: SelectedDestination,
): PreviewSegment[] => {
	const override = overrides[destination.id];

	return input.map((segment, index) => {
		const text = override?.texts[segment.key] ?? segment.text;
		const isFirst = segment.key === BODY_KEY;
		// Only the first segment's images can be customized per destination.
		const own = isFirst ? override?.media : null;
		const byKey = new Map(segment.images.map((image) => [image.key, image]));
		const chosen =
			own?.imageKeys == null
				? [...segment.images]
				: own.imageKeys.flatMap((key) => {
						const image = byKey.get(key);
						return image ? [image] : [];
					});
		const withAlt = chosen.map((image) => ({
			...image,
			altText: own?.altTexts[image.key] ?? image.altText,
		}));
		const cap = isFirst
			? destination.limits.maxImages
			: segmentMaxImages(destination.limits.maxImages);

		return {
			number: index + 1,
			text,
			textState: tightestLimit(countText(text), [destination])?.state ?? 'ok',
			images: withAlt.slice(0, cap),
			droppedImages: Math.max(withAlt.length - cap, 0),
		};
	});
};

const signature = (segments: readonly PreviewSegment[]): string =>
	JSON.stringify(
		segments.map((segment) => [
			segment.text,
			segment.textState,
			segment.images.map((image) => [image.key, image.altText]),
			segment.droppedImages,
		]),
	);

/**
 * The thread as it will publish to each SELECTED destination: its own text
 * where it customized one, its own images on the first segment, and only the
 * images its cap takes. Destinations that end up with the exact same thread
 * are one variant, so the preview only splits where limits or customizations
 * differ. With no destination selected, the shared thread is the one variant.
 */
export const buildThreadPreview = ({
	segments,
	overrides,
	destinations,
}: {
	segments: readonly PreviewSegmentInput[];
	overrides: DestinationOverrides;
	destinations: readonly SelectedDestination[];
}): PreviewVariant[] => {
	if (destinations.length === 0) {
		return [
			{
				destinations: [],
				destinationIds: [],
				segments: segments.map((segment, index) => ({
					number: index + 1,
					text: segment.text,
					textState: 'ok',
					images: [...segment.images],
					droppedImages: 0,
				})),
			},
		];
	}

	const variants = new Map<string, PreviewVariant>();
	for (const destination of destinations) {
		const thread = previewFor(segments, overrides, destination);
		const key = signature(thread);
		const known = variants.get(key);
		if (known) {
			known.destinations.push(destination.label);
			known.destinationIds.push(destination.id);
		} else {
			variants.set(key, {
				destinations: [destination.label],
				destinationIds: [destination.id],
				segments: thread,
			});
		}
	}
	return [...variants.values()];
};
