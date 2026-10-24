import type { TenantPostImage } from '~/lib/query/tenant-post-images';

import { ComposerDestinations } from './_composer-destinations';
import { toComposerImages } from './_composer-images';
import { ScheduledRenditionsBlock } from './_scheduled-renditions-block';
import type { SegmentDraft } from './_segment-draft';
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';

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
	isPostDirty,
}: {
	postId: string;
	tenantId: string;
	selection: PublishSelection;
	destinationOverrides: DestinationOverridesState;
	body: string;
	segments: readonly SegmentDraft[];
	images: TenantPostImage[];
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
