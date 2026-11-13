import type { DestinationOverrides } from '~/lib/publishing/destination-overrides';
import { BODY_KEY } from '~/lib/publishing/destination-overrides';

import type { SegmentDraft } from './_segment-draft';
import { ThreadPreview } from './_thread-preview';
import { buildThreadPreview } from './_thread-preview-model';
import type { PreviewImage } from './_thread-preview-model';
import type { SelectedDestination } from './_use-publish-selection';

/** The composer's read-only preview of a thread: shown once there is at least
 * one follow-up (a plain post has nothing to preview). The caller says which
 * images each segment holds, wherever they live (picked files in the drawer,
 * stored images on the edit page). */
export const ComposerThreadPreview = ({
	body,
	segments,
	bodyImages,
	imagesOfSegment,
	overrides,
	destinations,
}: {
	body: string;
	segments: readonly SegmentDraft[];
	bodyImages: readonly PreviewImage[];
	imagesOfSegment: (segment: SegmentDraft) => readonly PreviewImage[];
	overrides: DestinationOverrides;
	destinations: readonly SelectedDestination[];
}) => {
	if (segments.length === 0) {
		return null;
	}

	return (
		<ThreadPreview
			variants={buildThreadPreview({
				segments: [
					{ key: BODY_KEY, text: body, images: bodyImages },
					...segments.map((segment) => ({
						key: segment.id,
						text: segment.text,
						images: imagesOfSegment(segment),
					})),
				],
				overrides,
				destinations,
			})}
		/>
	);
};
