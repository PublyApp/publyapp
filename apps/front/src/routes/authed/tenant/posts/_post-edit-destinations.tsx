import type { TenantPostImage } from '~/lib/query/tenant-post-images';
import type { TenantPostDetails } from '~/lib/query/tenant-posts';

import { ComposerDestinations } from './_composer-destinations';
import { toComposerImages } from './_composer-images';
import { ComposerThreadPreview } from './_composer-thread-preview';
import { ScheduledRenditionsBlock } from './_scheduled-renditions-block';
import type { SegmentDraft } from './_segment-draft';
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';

const toPreviewImage = (image: TenantPostImage) => ({
	key: image.id ?? image.url,
	url: image.url,
	file: null,
	altText: image.altText ?? '',
});

/** The edit page's destinations: the chips with their per-destination tabs
 * (what the next publish or schedule sends) and, below them, the
 * destinations this post is already scheduled to. */
export const PostEditDestinations = ({
	postId,
	tenantId,
	selection,
	destinationOverrides,
	body,
	segments,
	images,
	storedSegments,
	isPostDirty,
}: {
	postId: string;
	tenantId: string;
	selection: PublishSelection;
	destinationOverrides: DestinationOverridesState;
	body: string;
	segments: readonly SegmentDraft[];
	images: TenantPostImage[];
	/** The follow-ups as stored: where each one's images are read from. */
	storedSegments: TenantPostDetails['segments'];
	/** Unsaved edits to the shared post. */
	isPostDirty: boolean;
}) => {
	const composerImages = toComposerImages(images);

	return (
		<>
			<ComposerDestinations
				selection={selection}
				destinationOverrides={destinationOverrides}
				body={body}
				segments={segments}
				images={composerImages}
			/>
			<ComposerThreadPreview
				body={body}
				segments={segments}
				bodyImages={images.map(toPreviewImage)}
				imagesOfSegment={(segment) =>
					(
						storedSegments.find(({ id }) => id === segment.serverId)?.images ??
						[]
					).map(toPreviewImage)
				}
				overrides={destinationOverrides.overrides}
				destinations={selection.destinations}
			/>
			<ScheduledRenditionsBlock
				postId={postId}
				tenantId={tenantId}
				selection={selection}
				body={body}
				segments={segments}
				images={composerImages}
				isPostDirty={isPostDirty}
			/>
		</>
	);
};
