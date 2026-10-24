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
}: {
	postId: string;
	tenantId: string;
	selection: PublishSelection;
	destinationOverrides: DestinationOverridesState;
	body: string;
	segments: SegmentDraft[];
	images: TenantPostImage[];
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
		/>
		<PublishOnBlock
			selection={selection}
			destinationOverrides={destinationOverrides}
			postId={postId}
			body={body}
			segments={segments}
			imageKeys={toComposerImages(images).map((image) => image.key)}
		/>
	</div>
);
