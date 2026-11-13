import type { TenantPostImage } from '~/lib/query/tenant-post-images';

import { toComposerImages } from './_composer-images';
import { PostImagePicker } from './_post-image-picker';
import { PublishOnBlock } from './_publish-on-block';
import type { SegmentDraft } from './_segment-draft';
import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';

/** The edit page's reserved side column: the post's images, then the publish
 * actions for the destinations selected in the chips. */
export const PostEditSideColumn = ({
	postId,
	tenantId,
	selection,
	destinationOverrides,
	body,
	segments,
	images,
	segmentImageCounts,
	isBusy,
	isPostDirty,
}: {
	postId: string;
	tenantId: string;
	selection: PublishSelection;
	destinationOverrides: DestinationOverridesState;
	body: string;
	segments: SegmentDraft[];
	images: TenantPostImage[];
	/** How many images each follow-up holds, by segment id. */
	segmentImageCounts: Readonly<Record<string, number>>;
	/** A save or upload of this page is in flight, or a picked file is still
	 * to attach: publishing, scheduling and the post's own images wait. */
	isBusy: boolean;
	/** Unsaved edits to the shared post. */
	isPostDirty: boolean;
}) => (
	<div
		className="space-y-4 lg:col-span-4"
		data-testid="tenant-post-edit-reserved-side-column"
	>
		<PostImagePicker
			postId={postId}
			tenantId={tenantId}
			existingImages={images}
			limits={selection.imageLimits}
			disabled={isBusy}
		/>
		<PublishOnBlock
			selection={selection}
			destinationOverrides={destinationOverrides}
			postId={postId}
			body={body}
			segments={segments}
			imageKeys={toComposerImages(images).map((image) => image.key)}
			segmentImageCounts={segmentImageCounts}
			isPostDirty={isPostDirty}
			disabled={isBusy}
		/>
	</div>
);
